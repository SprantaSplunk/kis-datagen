"""Clinical data sources of the KIS and its subsystems (synthetic patients only)."""

import math

from . import hospital as H
from .util import bump, clamp, daytime, noise, office, poisson, rng, unit, weighted

INSURERS = [("OEGK", 0.74), ("BVAEB", 0.12), ("SVS", 0.08), ("KFA Wien", 0.03), ("Privat / Ausland", 0.03)]
SEXES = [("w", 0.51), ("m", 0.48), ("d", 0.01)]


def ev(t, sourcetype, source, host, data):
    return (t, sourcetype, source, host, data)


def _pid(r):
    return "P%07d" % r.randint(1000000, 9999999)


def _case(r, ts):
    return "F%d%06d" % (2026 if ts < 1798761600 else 2027, r.randint(0, 999999))


def _age(r, dept):
    if dept == "PAED":
        return r.randint(0, 17)
    if dept == "GYN":
        return r.randint(18, 85) if r.random() < 0.5 else r.randint(22, 42)
    return int(clamp(r.gauss(64, 18), 18, 101))


def _ward_of(r, dept):
    wards = [w for w in H.WARDS if w["department"] == dept]
    return r.choice(wards) if wards else H.WARD["INN-1"]


def _spread(r, ts, window):
    return ts - window + r.random() * window


# ------------------------------------------------------------------- ADT
def adt(ctx, ts):
    """sakh:kis:adt - admissions, transfers, discharges, outpatient registrations."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    out = []
    for code in H.BED_DEPTS:
        d = H.DEPT[code]
        r = rng(ctx.seed, "adt", code, int(ts))
        per_min = d["beds"] * d["occ"] / max(0.3, d["los"]) / 1440.0
        adm = per_min * (0.35 + 1.4 * daytime(h, 9, 19, 2)) * (0.7 if wd >= 5 and d["surgical"] else 1)
        adm *= 1 + 1.6 * m.flu(ts) * H.FLU_DEPTS.get(code, 0)
        dis = per_min * (0.15 + 2.2 * bump(h, 11.5, 2.0)) * (0.6 if wd >= 5 else 1)
        for kind, lam in (("A01", adm), ("A03", dis), ("A02", per_min * 0.35), ("A08", per_min * 1.2)):
            for _ in range(poisson(r, lam)):
                w = _ward_of(r, code)
                t = _spread(r, ts, 60)
                atype = weighted(r, [("Notfall", 0.45 + (0.3 if code in ("ICU", "ZNA") else 0)),
                                     ("Elektiv", 0.45 if d["surgical"] else 0.25), ("Ueberweisung", 0.2)])
                data = {
                    "event_type": kind,
                    "event_name": {"A01": "Aufnahme", "A03": "Entlassung", "A02": "Verlegung",
                                   "A08": "Stammdatenaenderung"}[kind],
                    "patient_id": _pid(r), "case_id": _case(r, ts), "age": _age(r, code),
                    "sex": weighted(r, SEXES), "department": code, "department_name": d["name"],
                    "ward": w["ward"], "building": w["building"],
                    "bed": "%s-%02d" % (w["ward"], r.randint(1, w["beds"])),
                    "insurance": weighted(r, INSURERS), "facility": H.HOSPITAL_SHORT,
                }
                if kind == "A01":
                    data["admission_type"] = atype
                    data["ecard_check"] = "OK" if r.random() > 0.03 else "nicht gesteckt"
                if kind == "A03":
                    data["discharge_type"] = weighted(r, [("nach Hause", 0.78), ("Reha", 0.08),
                                                         ("Pflegeheim", 0.07), ("verlegt", 0.05),
                                                         ("verstorben", 0.02)])
                    data["los_days"] = round(max(0.2, r.gauss(d["los"], d["los"] * 0.4)), 1)
                if kind == "A02":
                    target = r.choice(H.BED_DEPTS)
                    data["to_department"] = target
                    data["to_ward"] = _ward_of(r, target)["ward"]
                data["kis_latency_ms"] = int(m.kis_response_ms(t) * (0.6 + 0.8 * r.random()))
                out.append(ev(t, "sakh:kis:adt", "kis:adt", "sakh-kisapp0%d" % r.randint(1, 4), data))
    return out


# ------------------------------------------------------------------- beds
def beds(ctx, ts):
    """sakh:kis:beds - bed status per ward every 5 minutes."""
    m = ctx.m
    out = []
    for w in H.WARDS:
        c = m.bed_counts(w["ward"], ts)
        data = dict(w)
        data.pop("floor", None)
        data.update(c)
        data["floor"] = w["floor"]
        data["occupancy_pct"] = round(100.0 * c["occupied"] / max(1, c["beds_total"]), 1)
        data["planned_discharges_today"] = int(round(c["occupied"] / max(0.5, H.DEPT[w["department"]]["los"])))
        data["status"] = "voll" if c["free"] == 0 else "kritisch" if data["occupancy_pct"] >= 95 else \
            "angespannt" if data["occupancy_pct"] >= 88 else "normal"
        out.append(ev(ts, "sakh:kis:beds", "kis:bettenmanagement", "sakh-kisapp01", data))
    return out


# ------------------------------------------------------------------- emergency department
def ed_tracking(ctx, ts):
    """sakh:ed:tracking - ED arrivals (Manchester Triage) every minute, board status every 5 minutes."""
    m = ctx.m
    r = rng(ctx.seed, "ed", int(ts))
    out = []
    flu = m.flu(ts)
    for _ in range(poisson(r, m.ed_rate(ts))):
        t = _spread(r, ts, 60)
        complaint, dept = r.choice(H.ED_COMPLAINTS)
        if flu > 0 and r.random() < 0.55 * flu:
            complaint, dept = r.choice([("Fieber", "INN"), ("Atemnot", "INN"), ("Fieber Kind", "PAED"),
                                        ("Husten / grippaler Infekt", "INN")])
        lvl = weighted(r, [(1, 0.02), (2, 0.12), (3, 0.38 + 0.08 * flu), (4, 0.38), (5, 0.10)])
        tri = H.TRIAGE[lvl - 1]
        out.append(ev(t, "sakh:ed:tracking", "ed:tracking", "sakh-kisapp02", {
            "type": "arrival", "patient_id": _pid(r), "case_id": _case(r, ts), "age": _age(r, dept),
            "sex": weighted(r, SEXES), "triage_level": lvl, "triage_color": tri[1], "triage_label": tri[2],
            "max_wait_min": tri[3], "complaint": complaint, "target_department": dept,
            "arrival_mode": weighted(r, [("selbst", 0.55), ("Rettung", 0.35), ("Notarzt", 0.08),
                                         ("Hubschrauber", 0.02)]),
            "department": "ZNA", "building": "C",
        }))
    if int(ts) % 300 == 0:
        s = m.ed_status(ts)
        s.update({"type": "status", "department": "ZNA", "building": "C"})
        for lvl, share, wait in ((1, 0.01, 0.02), (2, 0.08, 0.22), (3, 0.40, 0.62), (4, 0.39, 1.0), (5, 0.12, 0.85)):
            s["waiting_t%d" % lvl] = int(round(s["waiting"] * share))
            s["longest_t%d" % lvl] = int(round(s["longest_wait_min"] * wait)) if s["waiting_t%d" % lvl] else 0
        s["status"] = "Rettungsstopp" if s["ambulance_bypass"] else "ueberlastet" if s["waiting"] > 25 else \
            "angespannt" if s["waiting"] > 14 else "normal"
        out.append(ev(ts, "sakh:ed:tracking", "ed:tracking", "sakh-kisapp02", s))
    return out


# ------------------------------------------------------------------- laboratory
def lis(ctx, ts):
    """sakh:lis:result - laboratory results with turnaround time and KIS delivery state."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    r = rng(ctx.seed, "lis", int(ts))
    flu = m.flu(ts)
    lam = 0.8 + 2.4 * office(h, wd) + 1.2 * bump(h, 7.0, 1.0) + 1.2 * flu
    hl7 = m.impact("hl7_queue", ts)
    out = []
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        test = weighted(r, [(x, 0.4 if x[0] in ("INFLU",) and flu else w) for x, w in zip(
            H.LAB_TESTS, [12, 10, 8, 10, 10, 9, 9, 4, 3, 5, 6, 2, 0.6, 0.6, 1.2, 0.8, 0.6])])
        code, name, unit_, lo, hi, cat, clo, chi = test
        dept = weighted(r, [(d, H.DEPT[d]["beds"] + (60 if d == "ZNA" else 0)) for d in H.BED_DEPTS])
        prio = "Notfall" if dept in ("ZNA", "ICU") or r.random() < 0.15 else "Routine"
        tat = max(8, r.gauss(28 if prio == "Notfall" else 75, 12 if prio == "Notfall" else 25))
        if cat == "Mikrobiologie":
            tat = max(60, r.gauss(180, 40)) if code != "BLUTKULT" else r.gauss(2400, 400)
        if code in ("INFLU", "SARS2", "BLUTKULT"):
            pos_p = {"INFLU": 0.08 + 0.55 * flu, "SARS2": 0.06, "BLUTKULT": 0.12}[code]
            value = "positiv" if r.random() < pos_p else "negativ"
            flag = "A" if value == "positiv" else "N"
        elif code in ("ABO", "KREUZ"):
            value = r.choice(H.BLOOD_GROUPS) if code == "ABO" else ("vertraeglich" if r.random() > 0.01 else
                                                                    "unvertraeglich")
            flag = "N" if value != "unvertraeglich" else "A"
        else:
            span = hi - lo if hi > lo else max(1.0, hi)
            u = r.random()
            if u < 0.68:
                val = lo + r.random() * span
            elif u < 0.97:
                val = hi + r.random() * span * 0.6 if r.random() < 0.6 else max(0, lo - r.random() * span * 0.3)
                step = 10 ** -H.LAB_DECIMALS[code]
                val = min(val, chi - step) if code in H.LAB_CRITICAL else val
                val = max(val, clo + step) if clo > 0 else val
            else:
                _flag, near, far, _share = weighted(r, [(c, c[3]) for c in H.LAB_CRITICAL[code]])
                val = near + (far - near) * r.random() ** 2
            val = round(val, H.LAB_DECIMALS[code])
            value = val
            flag = "HH" if val >= chi else "LL" if (clo > 0 and val <= clo) else "H" if val > hi else \
                "L" if val < lo else "N"
        delivered = not (hl7 > 0.2 and r.random() < 0.95 * hl7)
        out.append(ev(t, "sakh:lis:result", "lis:results", "sakh-lisapp01", {
            "order_id": "L%09d" % r.randint(0, 999999999), "patient_id": _pid(r), "department": dept,
            "ward": _ward_of(r, dept)["ward"], "test_code": code, "test_name": name, "category": cat,
            "value": value, "unit": unit_, "ref_low": lo, "ref_high": hi, "flag": flag,
            "crit_low": clo if code in H.LAB_CRITICAL and clo > 0 else None,
            "crit_high": chi if code in H.LAB_CRITICAL else None,
            "critical": flag in ("HH", "LL"), "priority": prio, "tat_min": int(tat),
            "analyzer": {"Haematologie": "LAB-HAEM-1", "Gerinnung": "LAB-COAG-1",
                         "Immunhaematologie": "LAB-IH-1", "Blutgas": "LAB-BGA-1"}.get(cat, "LAB-CHEM-%d" % r.randint(1, 2)),
            "delivered_to_kis": delivered,
            "delivery_status": "zugestellt" if delivered else "in Warteschlange",
        }))
    return out


LIS_ACK_WINDOW = 180 * 60
LIS_ESCALATE_MIN = 30


def _critical_steps(ctx, t, d):
    """Notification, optional escalation and acknowledgement of one critical result: [(time, step)]."""
    r = rng(ctx.seed, "lisack", d["order_id"])
    night = 1 - daytime(ctx.clock.hour(t), 7.0, 19.0)
    notify = 1.5 + r.lognormvariate(math.log(3.0), 0.5)
    react = r.lognormvariate(math.log(4.0 + 4.0 * night), 0.6)
    in_kis = d.get("delivered_to_kis", True)
    if not in_kis:
        react *= 2.5
    if r.random() < 0.03:
        react += LIS_ESCALATE_MIN
    ack = min(notify + react, LIS_ACK_WINDOW / 60 - 5)
    escalated = ack > LIS_ESCALATE_MIN
    lab = "MTL-%02d" % r.randint(1, 24)
    steps = [(notify, {"action": "mitgeteilt", "channel": "Telefon", "staff": lab, "role": "Labor (MTL)", "escalation_level": 0})]
    if escalated:
        steps.append((LIS_ESCALATE_MIN, {"action": "eskaliert", "channel": "Telefon", "staff": lab, "role": "Labor (MTL)",
                                         "escalation_level": 1, "escalated_to": "Oberarzt"}))
        ack = max(ack, LIS_ESCALATE_MIN + 1.5 + r.random() * 10)
    steps.append((ack, {"action": "quittiert", "channel": "KIS" if in_kis else "Telefon (Befund nicht im KIS)",
                        "staff": "u%05d" % r.randint(0, 2399),
                        "role": "Oberarzt" if escalated else "Dienstarzt" if night > 0.5 else "Stationsarzt",
                        "escalation_level": 1 if escalated else 0}))
    return [(t + minutes * 60, dict(step, minutes=round(minutes, 1))) for minutes, step in steps]


def lis_critical(ctx, ts):
    """sakh:lis:critical - telephone notification, escalation and acknowledgement of critical lab values."""
    cache = ctx.lis_critical
    for tick in [k for k in cache if k < ts - LIS_ACK_WINDOW - 120]:
        del cache[tick]
    out = []
    first = (int(ts - 60 - LIS_ACK_WINDOW) // 60) * 60
    for tick in range(first, int(ts) + 1, 60):
        if tick not in cache:
            cache[tick] = [(e[0], e[4]) for e in lis(ctx, tick) if e[4].get("flag") in ("HH", "LL")]
        for t, d in cache[tick]:
            for when, step in _critical_steps(ctx, t, d):
                if ts - 60 < when <= ts:
                    out.append(ev(when, "sakh:lis:critical", "lis:critical", "sakh-lisapp01", dict(
                        {k: d[k] for k in ("order_id", "patient_id", "department", "ward", "test_code", "test_name",
                                           "value", "unit", "flag", "priority", "delivered_to_kis")},
                        result_time=round(t, 3), **step)))
    return out


# ------------------------------------------------------------------- blood bank
def blood_inventory(ctx, ts):
    """sakh:bloodbank:inventory - stock per product and ABO/Rh group every 10 minutes."""
    m = ctx.m
    out = []
    for product, label, shelf, _target in H.BLOOD_PRODUCTS:
        for g in H.BLOOD_GROUPS:
            avail = m.blood_level(product, g, ts)
            mn = m.blood_min(product, g)
            tgt = m.blood_target(product, g)
            r = rng(ctx.seed, "bbinv", product, g, int(ts // 600))
            reserved = min(avail, int(round(avail * (0.08 + 0.1 * r.random()))))
            exp48 = 0 if product == "FFP" else int(round(avail * (0.25 if product == "TK" else 0.04) * r.random()))
            usage = max(0.2, m.blood_usage(product, g))
            out.append(ev(ts, "sakh:bloodbank:inventory", "blutdepot:bestand", "sakh-bbapp01", {
                "product": product, "product_name": label, "blood_group": g, "units_available": avail,
                "units_reserved": reserved, "units_free": avail - reserved, "min_stock": mn,
                "target_stock": tgt, "expiring_48h": exp48, "daily_usage": round(usage, 1),
                "days_of_supply": round((avail - reserved) / usage, 1), "fill_pct": round(100.0 * avail / tgt, 1),
                "status": "kritisch" if avail < mn * 0.5 else "niedrig" if avail < mn else "ok",
                "supplier": "Blutspendedienst Oesterreichisches Rotes Kreuz",
            }))
    return out


def transfusion(ctx, ts):
    """sakh:bloodbank:transfusion - issued and transfused units."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    r = rng(ctx.seed, "trans", int(ts))
    lam = 0.06 + 0.09 * daytime(h, 8, 17, 2)
    out = []
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        product = weighted(r, [("EK", 0.72), ("FFP", 0.16), ("TK", 0.12)])
        g = weighted(r, list(H.BLOOD_USE.items()))
        short = m.impact("blood_shortage", ts) > 0.5 and product == "EK" and g in ("0-", "A-")
        dept = weighted(r, [("CHI", 3), ("UCH", 3), ("ICU", 4), ("ONK", 3), ("INN", 2), ("GYN", 1), ("ZNA", 2)])
        out.append(ev(t, "sakh:bloodbank:transfusion", "blutdepot:ausgabe", "sakh-bbapp01", {
            "unit_id": "AT%010d" % r.randint(0, 9999999999), "product": product, "blood_group": g,
            "patient_blood_group": g, "patient_id": _pid(r), "department": dept,
            "ward": _ward_of(r, dept)["ward"], "units": 1 if product != "FFP" else r.randint(2, 4),
            "indication": weighted(r, [("Akute Blutung", 0.3), ("Anaemie", 0.35), ("OP-Bedarf", 0.25),
                                       ("Gerinnungsstoerung", 0.1)]),
            "status": "Ausgabe abgelehnt - Bestand" if short and r.random() < 0.6 else
            weighted(r, [("transfundiert", 0.95), ("verworfen", 0.04), ("Transfusionsreaktion", 0.01)]),
        }))
    return out


# ------------------------------------------------------------------- radiology
def _modality_device(r, mod, ts, m):
    if mod == "MR":
        choices = ["MRT-1", "MRT-2", "MRT-3"]
        if m.impact("mri_cooling", ts) > 0:
            choices = ["MRT-2", "MRT-3"]
        return r.choice(choices)
    return {"CT": r.choice(["CT-1", "CT-2", "CT-3"]), "CR": "ROE-%d" % r.randint(1, 5),
            "US": "US-%02d" % r.randint(1, 12), "XA": r.choice(["ANGIO-1", "ANGIO-2"])}[mod]


def ris(ctx, ts):
    """sakh:ris:order - radiology orders and their status."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    r = rng(ctx.seed, "ris", int(ts))
    lam = 0.08 + 0.32 * office(h, wd) + 0.1 * m.flu(ts)
    mri = m.impact("mri_cooling", ts)
    out = []
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        mod = weighted(r, [(x[0], x[2]) for x in H.IMAGING_MODALITIES])
        dept = weighted(r, [(d, H.DEPT[d]["beds"] + (80 if d == "ZNA" else 0)) for d in H.BED_DEPTS])
        dev = _modality_device(r, mod, t, m)
        status = weighted(r, [("angefordert", 0.35), ("terminiert", 0.25), ("durchgefuehrt", 0.25),
                              ("befundet", 0.15)])
        data = {"order_id": "R%08d" % r.randint(0, 99999999), "patient_id": _pid(r), "modality": mod,
                "exam": r.choice(H.EXAMS[mod]), "department": dept, "ward": _ward_of(r, dept)["ward"],
                "priority": "Notfall" if dept in ("ZNA", "ICU") or r.random() < 0.12 else "Routine",
                "device_id": dev, "status": status,
                "wait_days": 0 if dept in ("ZNA", "ICU") else int(max(0, r.gauss(2 if mod != "MR" else 9, 2)))}
        if mod == "MR" and mri > 0 and r.random() < 0.6:
            data.update({"status": "umgeplant", "original_device": "MRT-1",
                         "reason": "MRT-1 gesperrt - Kuehlungsstoerung", "wait_days": data["wait_days"] + 3})
        out.append(ev(t, "sakh:ris:order", "ris:orders", "sakh-ris01", data))
    return out


def pacs(ctx, ts):
    """sakh:pacs:dicom - DICOM C-STORE of completed studies into the PACS."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    r = rng(ctx.seed, "pacs", int(ts))
    lam = 0.06 + 0.26 * office(h, wd) + 0.08 * m.flu(ts)
    out = []
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        mod = weighted(r, [(x[0], x[2]) for x in H.IMAGING_MODALITIES])
        images = {"CT": r.randint(300, 2500), "MR": r.randint(400, 3000), "CR": r.randint(1, 4),
                  "US": r.randint(10, 80), "XA": r.randint(200, 1500)}[mod]
        size = images * {"CT": 0.52, "MR": 0.25, "CR": 12.0, "US": 0.9, "XA": 1.0}[mod]
        dev = _modality_device(r, mod, t, m)
        bld = H.DEVICE.get(dev, {}).get("building", "C")
        fail = m.building_c_down(t) and bld == "C"
        out.append(ev(t, "sakh:pacs:dicom", "pacs:dicom", "sakh-pacs01", {
            "study_uid": "1.2.40.0.13.1.%d.%d" % (r.randint(10 ** 8, 10 ** 9), r.randint(0, 99999)),
            "modality": mod, "device_id": dev, "calling_ae": dev.replace("-", "_"), "called_ae": "SAKH_PACS",
            "images": images, "size_mb": round(size, 1), "dimse": "C-STORE",
            "store_ms": int(size * (8 + 6 * r.random())) if not fail else 0,
            "status": "Failure - association rejected" if fail else "Success",
            "building": bld,
        }))
    return out


# ------------------------------------------------------------------- operating rooms
def _or_plan(seed, room, day, wd, blood_short):
    r = rng(seed, "orplan", room["room"], day)
    procs = [p for p in H.PROCEDURES if (p[1] == "GYN") == room["room"].startswith("OP-D")]
    t = 7.5 + r.random() * 0.3
    end = 15.5 if wd < 5 else 0
    cases = []
    i = 0
    while t < end and len(cases) < 7:
        p = r.choice(procs)
        dur = max(25, r.gauss(p[2], p[2] * 0.2)) / 60.0
        delay = max(0.0, r.gauss(0.15, 0.25)) if i == 0 else max(0.0, r.gauss(0.08, 0.2))
        cases.append({"case_id": "OP%s%s%d" % (day.replace("-", ""), room["room"].replace("OP-", ""), i + 1),
                      "procedure": p[0], "department": p[1], "ops_code": p[3], "blood_units": p[4],
                      "planned_start": t, "planned_end": t + dur + 0.4,
                      "start": t + delay, "end": t + delay + dur + 0.4})
        t += dur + 0.4 + 0.42
        i += 1
    if r.random() < 0.35:
        p = r.choice(procs)
        s = 17 + r.random() * 5
        cases.append({"case_id": "OP%s%sN" % (day.replace("-", ""), room["room"].replace("OP-", "")),
                      "procedure": p[0], "department": p[1], "ops_code": p[3], "blood_units": p[4],
                      "planned_start": s, "planned_end": s + p[2] / 60 + 0.4, "start": s,
                      "end": s + p[2] / 60 + 0.4, "emergency": True})
    return cases


def or_cases(ctx, ts):
    """sakh:or:case - day plan (hourly), case milestones, room status every 5 minutes."""
    m = ctx.m
    out = []
    lt = ctx.clock.local(ts)
    day = lt.strftime("%Y-%m-%d")
    wd = lt.weekday()
    h = ctx.clock.hour(ts)
    midnight = ts - h * 3600
    short = m.impact("blood_shortage", ts) > 0.3
    for room in H.OR_ROOMS:
        plan = _or_plan(ctx.seed, room, day, wd, short)
        for c in plan:
            c["cancelled"] = bool(short and c["blood_units"] >= 2 and not c.get("emergency")
                                  and midnight + c["planned_start"] * 3600 > ctx.scen.onset.get("blood_shortage", 0))
        if int(ts) % 3600 == 0:
            for c in plan:
                out.append(ev(ts, "sakh:or:case", "op:plan", "sakh-opapp01", {
                    "type": "plan", "room": room["room"], "suite": room["suite"], "case_id": c["case_id"],
                    "procedure": c["procedure"], "department": c["department"], "ops_code": c["ops_code"],
                    "planned_start": round(midnight + c["planned_start"] * 3600),
                    "planned_end": round(midnight + c["planned_end"] * 3600),
                    "emergency": bool(c.get("emergency")), "blood_units_planned": c["blood_units"],
                    "status": "abgesetzt - Blutkonserven" if c["cancelled"] else "geplant"}))
        for c in plan:
            if c["cancelled"]:
                continue
            ms = [("Einschleusen", c["start"]), ("Schnitt", c["start"] + 0.3),
                  ("Naht", c["end"] - 0.2), ("Ausschleusen", c["end"])]
            for name, hh in ms:
                at = midnight + hh * 3600
                if ts - 60 < at <= ts:
                    out.append(ev(at, "sakh:or:case", "op:verlauf", "sakh-opapp01", {
                        "type": "milestone", "milestone": name, "room": room["room"], "case_id": c["case_id"],
                        "procedure": c["procedure"], "department": c["department"],
                        "delay_min": int(round((c["start"] - c["planned_start"]) * 60)),
                        "planned_start": round(midnight + c["planned_start"] * 3600),
                        "planned_end": round(midnight + c["planned_end"] * 3600),
                        "actual_start": round(midnight + c["start"] * 3600),
                        "actual_end": round(midnight + c["end"] * 3600) if name == "Ausschleusen" else None}))
        if int(ts) % 300 == 0:
            cur = next((c for c in plan if not c["cancelled"] and c["start"] <= h < c["end"]), None)
            nxt = next((c for c in plan if not c["cancelled"] and c["start"] > h), None)
            if cur:
                phase = "Einleitung" if h < cur["start"] + 0.3 else "Ausleitung" if h > cur["end"] - 0.2 else "OP laeuft"
            elif nxt and nxt["start"] - h < 0.45:
                phase = "Wechselzeit"
            else:
                phase = "frei"
            data = {"type": "room_status", "room": room["room"], "suite": room["suite"], "building": room["building"],
                    "phase": phase, "case_id": cur["case_id"] if cur else None,
                    "procedure": cur["procedure"] if cur else None, "department": cur["department"] if cur else None,
                    "delay_min": int(round((cur["start"] - cur["planned_start"]) * 60)) if cur else 0,
                    "cases_today": len(plan), "cases_done": sum(1 for c in plan if c["end"] <= h and not c["cancelled"]),
                    "cases_cancelled": sum(1 for c in plan if c["cancelled"]),
                    "utilization_pct": round(100 * sum(min(h, c["end"]) - c["start"] for c in plan
                                                       if not c["cancelled"] and c["start"] < h) / max(1.0, min(h, 15.5) - 7.5), 1)
                    if h > 7.5 else 0.0}
            out.append(ev(ts, "sakh:or:case", "op:saalstatus", "sakh-opapp01", data))
    return out


# ------------------------------------------------------------------- ICU / PDMS
def pdms(ctx, ts):
    """sakh:pdms:vitals - vital signs of occupied ICU beds every 2 minutes."""
    m = ctx.m
    out = []
    down = m.building_c_down(ts)
    for w in H.WARDS:
        if w["department"] != "ICU":
            continue
        for b in range(1, w["beds"] + 1):
            if not m.bed_occupied(w["ward"], b, ts):
                continue
            bed = "%s-%02d" % (w["ward"], b)
            pid = m.stay_id(w["ward"], b, ts)
            if down:
                if int(ts) % 600 == 0:
                    out.append(ev(ts, "sakh:pdms:vitals", "pdms:vitals", "sakh-pdms01", {
                        "bed": bed, "ward": w["ward"], "department": "ICU", "building": "C", "patient_id": pid,
                        "data_status": "keine Daten - Geraeteverbindung unterbrochen"}))
                continue
            sev = unit(ctx.seed, "sev", pid)
            n = lambda k, p=600: noise(ctx.seed, "%s-%s" % (pid, k), ts, p)
            vent = sev > 0.45
            u = unit(ctx.seed, "rhythm", pid)
            rhythm = "SR" if u < 0.45 else "VHF" if u < 0.65 else "VES" if u < 0.77 else "LSB" if u < 0.85 \
                else "SM" if u < 0.92 else "AVB1"
            hr = 78 + 25 * sev + 8 * n("hr")
            if rhythm == "VHF":
                hr += 8 + 10 * n("af", 240)
            elif rhythm == "SM":
                hr = 70 + 1.5 * n("hr")
            spo2 = 97 - 6 * sev + 1.5 * n("spo2")
            if sev > 0.92 and n("crit", 1800) > 0.6:
                hr += 30
                spo2 -= 6
            data = {"bed": bed, "ward": w["ward"], "department": "ICU", "building": "C", "patient_id": pid,
                    "hr": int(hr), "spo2": int(clamp(spo2, 70, 100)), "rr": int(14 + 10 * sev + 3 * n("rr")),
                    "nibp_sys": int(122 - 25 * sev + 12 * n("sys")), "nibp_dia": int(72 - 12 * sev + 6 * n("dia")),
                    "temp_c": round(37.0 + 1.2 * sev * max(0, n("t", 3600)) + 0.2 * n("t2"), 1),
                    "ventilated": vent, "fio2": round(0.3 + 0.4 * sev, 2) if vent else 0.21,
                    "peep": int(5 + 6 * sev) if vent else 0, "rhythm": rhythm, "data_status": "ok"}
            score = (hr > 110) + (hr > 130) + (data["spo2"] < 92) * 2 + (data["rr"] > 24) + (data["nibp_sys"] < 95) * 2
            data["news2"] = int(score + (2 if vent else 0))
            data["alarm"] = "rot" if data["news2"] >= 7 else "gelb" if data["news2"] >= 5 else "keiner"
            out.append(ev(ts, "sakh:pdms:vitals", "pdms:vitals", "sakh-pdms01", data))
    return out


# ------------------------------------------------------------------- pharmacy
def pharmacy(ctx, ts):
    """sakh:pharmacy - ward dispensing (every minute) and stock levels (every 30 minutes)."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    flu = m.flu(ts)
    r = rng(ctx.seed, "apo", int(ts))
    out = []
    for _ in range(poisson(r, 0.15 + 0.9 * office(h, wd))):
        t = _spread(r, ts, 60)
        atc, drug, daily, controlled = weighted(r, [(d, d[2] * (3 if flu and d[0] in ("J05AH02", "N02BE01") else 1))
                                                    for d in H.DRUGS])
        dept = weighted(r, [(d, H.DEPT[d]["beds"]) for d in H.BED_DEPTS])
        out.append(ev(t, "sakh:pharmacy", "apotheke:ausgabe", "sakh-apo01", {
            "type": "dispense", "atc": atc, "drug": drug, "controlled": controlled,
            "department": dept, "ward": _ward_of(r, dept)["ward"], "quantity": r.randint(1, 20),
            "order_type": weighted(r, [("Stationsanforderung", 0.6), ("Patientenbezogen", 0.35),
                                       ("Zytostatika", 0.05 if dept == "ONK" else 0.0)])}))
    if int(ts) % 1800 == 0:
        for atc, drug, daily, controlled in H.DRUGS:
            usage = daily * (1 + (2.2 * flu if atc in ("J05AH02", "N02BE01", "J01CR02") else 0.3 * flu))
            shortage = atc in ("J01CR02",) or (atc == "J05AH02" and flu > 0.5)
            level = 0.55 + 0.35 * noise(ctx.seed, "apo-" + atc, ts, 6 * 3600)
            if shortage:
                level *= 0.35
            on_hand = int(daily * 7 * clamp(level, 0.02, 1.2))
            dos = round(on_hand / max(1.0, usage), 1)
            out.append(ev(ts, "sakh:pharmacy", "apotheke:bestand", "sakh-apo01", {
                "type": "stock", "atc": atc, "drug": drug, "controlled": controlled, "on_hand": on_hand,
                "reorder_point": int(daily * 3), "daily_usage": int(usage), "days_of_supply": dos,
                "basg_shortage": shortage,
                "status": "kritisch" if dos < 1.5 else "niedrig" if dos < 3 else "ok"}))
    return out


# ------------------------------------------------------------------- nursing
def staffing(ctx, ts):
    """sakh:nursing:staffing - nurses per ward and shift every 30 minutes."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    shift = "Frueh" if 6 <= h < 14 else "Spaet" if 14 <= h < 22 else "Nacht"
    flu = m.flu(ts)
    out = []
    for w in H.WARDS:
        c = m.bed_counts(w["ward"], ts)
        ratio = {"ICU": 2.0, "ZNA": 3.0, "ANA": 2.5, "PSY": 7.0}.get(w["department"], 6.0)
        if shift == "Nacht":
            ratio *= 2.2 if w["department"] not in ("ICU",) else 1.2
        elif shift == "Spaet":
            ratio *= 1.3
        planned = max(1, int(math.ceil(w["beds"] * H.DEPT[w["department"]]["occ"] / ratio)))
        r = rng(ctx.seed, "staff", w["ward"], int(ts // 28800))
        sick = int(round(planned * (0.06 + 0.12 * flu) * r.random() * 2))
        leasing = 1 if sick >= 2 and r.random() < 0.4 else 0
        present = max(1, planned - sick + leasing)
        pts = c["occupied"]
        out.append(ev(ts, "sakh:nursing:staffing", "pflege:dienstplan", "sakh-kisapp01", {
            "ward": w["ward"], "department": w["department"], "building": w["building"], "shift": shift,
            "nurses_planned": planned, "nurses_present": present, "sick_leave": sick, "leasing": leasing,
            "patients": pts, "patients_per_nurse": round(pts / present, 1),
            "status": "unterbesetzt" if pts / present > ratio * 1.25 else "angespannt" if pts / present > ratio else "ok"}))
    return out


# ------------------------------------------------------------------- billing (LKF)
def billing(ctx, ts):
    """sakh:billing - LKF coding of discharged cases (Austrian DRG system)."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    r = rng(ctx.seed, "lkf", int(ts))
    out = []
    groups = [("HDG04.11", "Pneumonie", 4200), ("HDG05.04", "Herzinsuffizienz", 5100),
              ("MEL08.06", "Hueftendoprothese", 11200), ("MEL06.13", "Cholezystektomie", 4600),
              ("HDG01.04", "Schlaganfall", 7600), ("MEL15.01", "Sectio", 3900),
              ("HDG17.02", "Chemotherapie", 2600), ("HDG23.01", "Influenza", 2900)]
    for _ in range(poisson(r, 0.05 + 0.3 * daytime(h, 8, 16, 1))):
        t = _spread(r, ts, 60)
        g = r.choice(groups)
        if m.flu(ts) and r.random() < 0.4 * m.flu(ts):
            g = groups[-1]
        status = weighted(r, [("kodiert", 0.6), ("offen - Dokumentation fehlt", 0.15), ("uebermittelt", 0.25)])
        out.append(ev(t, "sakh:billing", "lkf:abrechnung", "sakh-kisapp03", {
            "case_id": _case(r, ts), "lkf_group": g[0], "lkf_group_name": g[1],
            "lkf_points": int(g[2] * (0.8 + 0.4 * r.random())), "department": r.choice(H.BED_DEPTS),
            "los_days": round(max(0.5, r.gauss(5, 2.5)), 1), "coding_status": status,
            "insurance": weighted(r, INSURERS), "payer": "Wiener Gesundheitsfonds"}))
    if int(ts) % 900 == 0 and (m.lead("kis_db", ts) > 0 or 1 <= h < 2):
        running = m.lead("kis_db", ts) > 0
        out.append(ev(ts, "sakh:billing", "lkf:batch", "sakh-kisapp03", {
            "type": "batch", "job": "LKF-Export", "status": "laeuft" if running else "abgeschlossen",
            "rows_processed": int(250000 * (m.lead("kis_db", ts) if running else 1)),
            "started_by": "batch_lkf", "duration_s": int(ctx.scen.elapsed("kis_db", ts) or 2400)}))
    return out


# ------------------------------------------------------------------- KIS audit log
def audit(ctx, ts):
    """sakh:kis:audit - KIS access log incl. response times and break-the-glass access."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    r = rng(ctx.seed, "audit", int(ts))
    lam = 4 + 28 * office(h, wd) + 6 * bump(h, 7.0, 0.6) + 5 * m.flu(ts)
    rt = m.kis_response_ms(ts)
    out = []
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        role = weighted(r, H.USER_ROLES)
        dept = weighted(r, [(d, H.DEPT[d]["beds"] + 20) for d in H.BED_DEPTS])
        w = _ward_of(r, dept)
        action = weighted(r, [("Patientenakte geoeffnet", 0.34), ("Befund gelesen", 0.2), ("Dokument erstellt", 0.12),
                              ("Verordnung", 0.1 if role == "Arzt" else 0.02), ("Pflegedokumentation", 0.15 if role == "Pflege" else 0.01),
                              ("Login", 0.05), ("Logout", 0.04), ("Druck", 0.03)])
        btg = action == "Patientenakte geoeffnet" and r.random() < 0.004
        ms = int(rt * (0.4 + 1.2 * r.random()) * (3 if action == "Dokument erstellt" else 1))
        result = "Erfolg"
        if action == "Login" and r.random() < 0.04:
            result = "Fehlgeschlagen"
        if ms > 8000 and r.random() < 0.3:
            result = "Timeout"
        out.append(ev(t, "sakh:kis:audit", "kis:audit", "sakh-kisapp0%d" % r.randint(1, 4), {
            "user": "u%05d" % int(r.random() * 2400), "role": role, "workstation": "KIS-%s%d-%03d" % (
                w["building"], w["floor"], r.randint(1, 40)), "department": dept, "ward": w["ward"],
            "action": action, "patient_id": _pid(r) if action not in ("Login", "Logout") else None,
            "response_ms": ms, "result": result, "break_the_glass": btg,
            "btg_reason": "Notfall - Patient nicht in eigener Station" if btg else None,
            "client": weighted(r, [("Citrix", 0.7), ("Fat Client", 0.2), ("Mobile Visite", 0.1)])}))
    return out


# ------------------------------------------------------------------- nurse call
def nursecall(ctx, ts):
    """sakh:nursecall - nurse call system: calls and response times."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    r = rng(ctx.seed, "ruf", int(ts))
    out = []
    lam_total = H.TOTAL_BEDS * 2.6 / 1440 * (0.6 + 0.6 * bump(h, 8, 3) + 0.4 * bump(h, 20, 2.5))
    for _ in range(poisson(r, lam_total)):
        t = _spread(r, ts, 60)
        w = weighted(r, [(x, x["beds"]) for x in H.WARDS])
        kind = weighted(r, [("Patientenruf", 0.72), ("WC-Ruf", 0.15), ("Pflegeruf", 0.1), ("Herzalarm", 0.006),
                            ("Notruf Personal", 0.024)])
        load = m.occupancy(w["ward"], t)
        resp = max(10, r.gauss(70 + 260 * max(0.0, load - 0.85), 35)) if kind not in ("Herzalarm",) else r.gauss(45, 10)
        out.append(ev(t, "sakh:nursecall", "lichtruf", "sakh-ruf01", {
            "ward": w["ward"], "department": w["department"], "building": w["building"],
            "room": "%s%d.%02d" % (w["building"], w["floor"], r.randint(1, 15)), "bed": r.randint(1, 3),
            "call_type": kind, "priority": "hoch" if kind in ("Herzalarm", "Notruf Personal") else "normal",
            "response_s": int(resp), "status": "quittiert"}))
    return out


# ------------------------------------------------------------------- eHealth
def ehealth(ctx, ts):
    """sakh:ehealth - ELGA, e-card, e-Medikation, e-Rezept: service KPIs and document uploads."""
    m = ctx.m
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    r = rng(ctx.seed, "ehealth", int(ts))
    out = []
    if int(ts) % 300 == 0:
        for sid, name, per_min, base_ms in H.EHEALTH_SERVICES:
            req = int(per_min * 5 * (0.15 + 0.85 * office(h, wd)) * (1 + 0.6 * m.flu(ts)))
            err_rate = 0.004 + 0.003 * max(0.0, noise(ctx.seed, "eh-" + sid, ts, 3600))
            ms = base_ms * (1 + 0.25 * noise(ctx.seed, "ehms-" + sid, ts, 1800))
            if sid == "elga_ebefund":
                req = int(req * (1 - 0.7 * m.impact("hl7_queue", ts)))
            if sid == "ecard_ecs" and unit(ctx.seed, "ecs-slow", int(ts // 7200)) < 0.05:
                ms *= 4
                err_rate += 0.05
            out.append(ev(ts, "sakh:ehealth", "ehealth:services", "sakh-elga01", {
                "type": "service", "service": sid, "service_name": name, "requests": req,
                "errors": int(round(req * err_rate)), "error_pct": round(100 * err_rate, 2),
                "avg_response_ms": int(ms), "status": "gestoert" if err_rate > 0.03 or ms > base_ms * 3 else "ok",
                "gateway": "sakh-elga01"}))
    lam = 0.08 + 0.25 * office(h, wd)
    for _ in range(poisson(r, lam)):
        t = _spread(r, ts, 60)
        doc = weighted(r, [("Entlassungsbrief Aerztlich", 0.35), ("Entlassungsbrief Pflege", 0.2),
                           ("Laborbefund", 0.3), ("Befund bildgebende Diagnostik", 0.15)])
        hl7_late = doc == "Laborbefund" and m.impact("hl7_queue", ts) > 0.3
        out.append(ev(t, "sakh:ehealth", "ehealth:elga", "sakh-elga01", {
            "type": "document", "document_type": doc, "patient_id": _pid(r),
            "department": r.choice(H.BED_DEPTS), "transaction": "ITI-41 Provide and Register",
            "status": "verzoegert" if hl7_late else ("Erfolg" if r.random() > 0.01 else "Fehler"),
            "response_ms": int(r.gauss(900, 250))}))
    return out


GENERATORS = [
    ("adt", 60, adt),
    ("beds", 300, beds),
    ("ed", 60, ed_tracking),
    ("lis", 60, lis),
    ("lis_critical", 60, lis_critical),
    ("blood_inventory", 600, blood_inventory),
    ("transfusion", 60, transfusion),
    ("ris", 60, ris),
    ("pacs", 60, pacs),
    ("or", 60, or_cases),
    ("pdms", 120, pdms),
    ("pharmacy", 60, pharmacy),
    ("staffing", 1800, staffing),
    ("billing", 60, billing),
    ("audit", 60, audit),
    ("nursecall", 60, nursecall),
    ("ehealth", 60, ehealth),
]
