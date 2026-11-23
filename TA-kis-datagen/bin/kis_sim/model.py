"""Shared hospital state derived from time, seed and scenarios.

Several data sources read the same quantities (ward occupancy, ED load, ICU beds, blood stock,
MRI helium), so they are computed here once and stay consistent across sources.
"""

import math

from . import hospital as H
from .util import bump, clamp, ed_curve, noise, unit


class Model:
    def __init__(self, seed, clock, scen):
        self.seed = seed
        self.clock = clock
        self.scen = scen

    # ------------------------------------------------------------- scenario shortcuts
    def lead(self, name, ts):
        return self.scen.lead(name, ts)

    def impact(self, name, ts):
        return self.scen.impact(name, ts)

    def building_c_down(self, ts):
        return self.impact("network_building_c", ts) > 0.5

    # ------------------------------------------------------------- patient flow
    def flu(self, ts):
        return self.impact("flu_surge", ts)

    def ed_rate(self, ts):
        """Expected ED arrivals per minute."""
        h = self.clock.hour(ts)
        wd = self.clock.weekday(ts)
        base = 0.15 * ed_curve(h) * (1.12 if wd == 0 else 0.92 if wd >= 5 else 1.0)
        base *= 1 + 0.12 * noise(self.seed, "ed", ts, 1800)
        return base * (1 + 1.5 * self.flu(ts) + 0.35 * self.lead("flu_surge", ts))

    def occupancy(self, ward, ts):
        """Occupied share of a ward's beds (0..1)."""
        w = H.WARD[ward]
        dept = H.DEPT[w["department"]]
        h = self.clock.hour(ts)
        wd = self.clock.weekday(ts)
        occ = dept["occ"]
        if dept["code"] in ("ZNA", "ANA"):
            occ = dept["occ"] * (0.45 + 0.9 * (ed_curve(h) / 1.4 if dept["code"] == "ZNA" else
                                               bump(h, 13.0, 3.0)))
        else:
            occ += -0.05 * bump(h, 12.0, 2.0) + 0.03 * bump(h, 19.0, 3.0)
            if dept["surgical"] and wd >= 5:
                occ -= 0.08
        occ += 0.04 * noise(self.seed, "occ-" + ward, ts, 3 * 3600)
        occ += 0.02 * (unit(self.seed, "occ-off", ward) - 0.5)
        f = self.flu(ts) * H.FLU_DEPTS.get(dept["code"], 0.0)
        occ += f * (1.08 - occ)
        if dept["code"] in ("CHI", "UCH", "URO") and self.impact("blood_shortage", ts) > 0:
            occ -= 0.04 * self.impact("blood_shortage", ts)
        return clamp(occ, 0.05, 1.0)

    def bed_counts(self, ward, ts):
        w = H.WARD[ward]
        beds = w["beds"]
        blocked = int(round(beds * (0.02 + 0.02 * unit(self.seed, "blk", ward, int(ts // 21600)))))
        occupied = min(beds - blocked, int(round(beds * self.occupancy(ward, ts))))
        h = self.clock.hour(ts)
        cleaning = int(round((beds - occupied - blocked) * (0.10 + 0.25 * bump(h, 13.0, 2.5))))
        cleaning = max(0, min(cleaning, beds - occupied - blocked))
        free = beds - occupied - blocked - cleaning
        isolation = int(round(occupied * (0.04 + 0.12 * self.flu(ts) * H.FLU_DEPTS.get(w["department"], 0))))
        return {"beds_total": beds, "occupied": occupied, "free": free, "cleaning": cleaning,
                "blocked": blocked, "isolation": isolation}

    def bed_occupied(self, ward, bed_no, ts):
        """Deterministic per-bed occupancy consistent with the ward share."""
        occ = self.occupancy(ward, ts)
        return unit(self.seed, "bed", ward, bed_no) < occ

    def stay_id(self, ward, bed_no, ts):
        los = max(0.5, H.DEPT[H.WARD[ward]["department"]]["los"]) * 86400
        k = int((ts + unit(self.seed, "stayoff", ward, bed_no) * los) // los)
        return "P%07d" % int(unit(self.seed, "pid", ward, bed_no, k) * 9999999)

    def ed_status(self, ts):
        rate = self.ed_rate(ts)
        flu = self.flu(ts)
        inn_full = min(self.occupancy("INN-1", ts), self.occupancy("INN-2", ts))
        boarding = int(round(2 + 3 * noise(self.seed, "board", ts, 1800) ** 2 + 22 * flu * max(0.0, inn_full - 0.9) / 0.1))
        waiting = int(round(rate * 60 * (0.55 + 1.6 * flu) + 2 * noise(self.seed, "edw", ts, 900)))
        in_treatment = int(round(rate * 60 * 1.4 + 6))
        longest = int(round(35 + 60 * rate / 0.18 + 150 * flu + 15 * noise(self.seed, "edl", ts, 1200)))
        door_doc = int(round(12 + 18 * rate / 0.18 + 55 * flu))
        return {"waiting": max(0, waiting), "in_treatment": max(1, in_treatment), "boarding": max(0, boarding),
                "longest_wait_min": max(5, longest), "door_to_doc_min": max(3, door_doc),
                "ambulance_bypass": 1 if flu > 0.85 else 0, "arrivals_per_hour": round(rate * 60, 1)}

    # ------------------------------------------------------------- blood bank
    def blood_level(self, product, group, ts):
        """Available units of a blood product."""
        target = next(p[3] for p in H.BLOOD_PRODUCTS if p[0] == product) * H.BLOOD_SHARE[group]
        h = self.clock.hour(ts)
        base = 0.86 + 0.08 * noise(self.seed, "bb-" + product + group, ts, 4 * 3600)
        base -= 0.10 * bump(h, 15.0, 3.0)
        base += 0.08 * bump(h, 9.0, 1.2)
        if product == "TK":
            base -= 0.12 * (0.5 + 0.5 * math.sin(ts / 86400 * 2 * math.pi / 5))
        imp = self.impact("blood_shortage", ts)
        lead = self.lead("blood_shortage", ts)
        if product == "EK" and group in ("0-", "A-"):
            base = base * (1 - 0.15 * lead) * (1 - 0.88 * imp)
        elif product == "EK" and group in ("0+", "B-"):
            base = base * (1 - 0.45 * imp)
        elif product == "TK":
            base = base * (1 - 0.25 * imp)
        base *= 1 - 0.12 * self.flu(ts)
        return max(0, int(round(target * clamp(base, 0, 1.3))))

    def blood_min(self, product, group):
        target = next(p[3] for p in H.BLOOD_PRODUCTS if p[0] == product) * H.BLOOD_SHARE[group]
        return max(1, int(round(target * 0.4)))

    def blood_target(self, product, group):
        return max(1, int(round(next(p[3] for p in H.BLOOD_PRODUCTS if p[0] == product) * H.BLOOD_SHARE[group])))

    # ------------------------------------------------------------- MRI helium
    def helium(self, device, ts):
        base = {"MRT-1": 91.5, "MRT-2": 88.0, "MRT-3": 93.0}.get(device, 90.0)
        level = base + 0.3 * noise(self.seed, "he-" + device, ts, 6 * 3600)
        if device == "MRT-1":
            e = self.scen.elapsed("mri_cooling", ts)
            if e is not None and e > 360:
                level -= min(24.0, (e - 360) / 60.0 * 0.55)
        return round(level, 2)

    # ------------------------------------------------------------- infrastructure
    def kis_response_ms(self, ts):
        h = self.clock.hour(ts)
        wd = self.clock.weekday(ts)
        load = 0.3 + 0.7 * (bump(h, 10.0, 2.5) + 0.6 * bump(h, 14.5, 2.0)) * (0.6 if wd >= 5 else 1)
        ms = 180 + 160 * load + 30 * noise(self.seed, "kisrt", ts, 600)
        ms *= 1 + 0.5 * self.lead("kis_db", ts) + 9 * self.impact("kis_db", ts)
        return max(80, ms)

    def hl7_backlog(self, channel, ts):
        e = self.scen.elapsed("hl7_queue", ts)
        if e is None:
            return 0
        rate = next(c[4] for c in H.HL7_CHANNELS if c[0] == channel)
        if channel == "LIS_KIS_ORU":
            if e < 360:
                return int(e / 360 * 40)
            return int(40 + (e - 360) / 60 * rate * 0.95)
        if channel in ("RIS_KIS_ORU", "PDMS_KIS_ORU", "BB_KIS_ORU") and e > 360:
            return int((e - 360) / 60 * rate * 0.6)
        return 0

    def kom_fs_used(self, ts):
        base = 71.0 + 1.5 * noise(self.seed, "komfs", ts, 7200)
        e = self.scen.elapsed("hl7_queue", ts)
        if e is not None:
            base += min(29.0, (e / 360.0) * 25.0)
        return clamp(base, 0, 100)

    def device_down(self, name, ts):
        d = H.NET.get(name)
        if not d:
            return False
        if self.building_c_down(ts):
            if name == "sakh-c-dist01" or name == "sakh-c-dist02":
                return True
            if d["building"] == "C" and d["role"] == "ACCESS" and d["family"] != "Wireless Controller":
                return True
        return False
