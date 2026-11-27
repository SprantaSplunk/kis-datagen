"""Simulated-clock tests for TA-kis-datagen (no Splunk needed).

    python3 tests/test_kis_sim.py -v
"""

import json
import os
import re
import sys
import unittest

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "TA-kis-datagen", "bin")
sys.path.insert(0, BIN)

from kis_sim import hospital as H  # noqa: E402
from kis_sim.engine import Simulation  # noqa: E402
from kis_sim.metrics import METRICS_ONLY, direct_lines  # noqa: E402
from kis_sim.scenarios import NAMES  # noqa: E402

NOW = 1795600800.0  # Wed 2026-11-25 09:00 CET
EVENT_SOURCETYPES = {
    "sakh:kis:adt", "sakh:kis:beds", "sakh:ed:tracking", "sakh:lis:result", "sakh:lis:critical", "sakh:bloodbank:inventory",
    "sakh:bloodbank:transfusion", "sakh:ris:order", "sakh:pacs:dicom", "sakh:or:case", "sakh:pdms:vitals",
    "sakh:pharmacy", "sakh:nursing:staffing", "sakh:billing", "sakh:kis:audit", "sakh:nursecall", "sakh:ehealth",
    "cisco:dnac:devicehealth", "cisco:ios", "cisco:iq:asset", "cisco:iq:advisory", "cisco:iq:fieldnotice",
    "cisco:iq:contract", "cisco:ise:syslog", "sakh:thousandeyes:test", "sakh:medtech:telemetry", "WinEventLog",
    "syslog", "sakh:db:performance", "sakh:backup", "sakh:hl7:engine", "snow:cmdb_ci_server",
    "snow:cmdb_ci_netgear", "snow:cmdb_ci_medical_device", "snow:cmdb_ci_service", "snow:cmdb_rel_ci",
    "snow:alm_asset", "snow:incident", "snow:change_request",
}
METRIC_PREFIXES = ("sakh.server.", "sakh.vmware.", "sakh.db.", "sakh.hl7.", "sakh.te.", "sakh.beds.", "sakh.blood.",
                   "sakh.icu.", "sakh.ed.", "sakh.ehealth.", "sakh.nursing.", "sakh.network.", "sakh.medtech.",
                   "sakh.mri.", "sakh.lab.")


def run(hours=2.0, scenarios=None, onset_ago=3600, metrics=True, seed="sakh", **kw):
    events, metric_points = [], []
    flags = {n: True for n in (scenarios or [])}
    onset = {n: NOW - onset_ago for n in (scenarios or [])}
    sim = Simulation(lambda t, st, src, host, data: events.append((t, st, src, host, data)), start_ts=NOW - hours * 3600,
                     seed=seed, scenarios=flags, onset=onset,
                     emit_metric=(lambda t, src, host, f: metric_points.append((t, src, host, f))) if metrics else None,
                     **kw)
    sim.run_until(NOW)
    return sim, events, metric_points


class BaseVolume(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sim, cls.events, cls.metrics = run(hours=7)

    def test_every_event_sourcetype_present(self):
        seen = {e[1] for e in self.events}
        self.assertEqual(set(), EVENT_SOURCETYPES - seen, "missing sourcetypes")

    def test_metrics_only_sources_not_in_events(self):
        seen = {e[1] for e in self.events}
        self.assertEqual(set(), seen & METRICS_ONLY)

    def test_blood_stock_realistic(self):
        last = {}
        for _t, st, _s, _h, d in self.events:
            if st == "sakh:bloodbank:inventory":
                last[(d["product"], d["blood_group"])] = d
        self.assertEqual(24, len(last))
        self.assertGreaterEqual(sum(d["units_available"] for k, d in last.items() if k[0] == "EK"), 300)
        self.assertEqual({"ok"}, {d["status"] for d in last.values()})
        for k, d in last.items():
            if k[0] == "EK":
                self.assertTrue(3 <= d["days_of_supply"] <= 15, (k, d["days_of_supply"]))

    def test_lab_critical_values_near_limits(self):
        crit = [d for _t, st, _s, _h, d in self.events if st == "sakh:lis:result" and d.get("flag") in ("HH", "LL")]
        self.assertGreater(len(crit), 10)
        for d in crit:
            bands = {flag: (near, far) for flag, near, far, _w in H.LAB_CRITICAL[d["test_code"]]}
            near, far = bands[d["flag"]]
            self.assertTrue(min(near, far) <= d["value"] <= max(near, far), (d["test_code"], d["flag"], d["value"]))
            self.assertIsNotNone(d["crit_high"])
            if d["flag"] == "LL":
                self.assertLess(d["value"], d["crit_low"])
            else:
                self.assertGreater(d["value"], d["crit_high"])

    def test_critical_values_acknowledged(self):
        results = {d["order_id"]: t for t, st, _s, _h, d in self.events
                   if st == "sakh:lis:result" and d.get("flag") in ("HH", "LL")}
        steps = {}
        for t, st, _s, _h, d in self.events:
            if st == "sakh:lis:critical":
                steps.setdefault(d["order_id"], {})[d["action"]] = (t, d)
        for oid, t in results.items():
            got = steps.get(oid, {})
            if t < NOW - 240 * 60:
                self.assertIn("quittiert", got, oid)
            for action, (when, d) in got.items():
                self.assertAlmostEqual(when, t + d["minutes"] * 60, delta=4)
            if "quittiert" in got:
                self.assertIn("mitgeteilt", got)
                ack = got["quittiert"][1]
                self.assertGreater(ack["minutes"], got["mitgeteilt"][1]["minutes"])
                self.assertEqual(ack["minutes"] > 30, "eskaliert" in got, oid)
        overdue = [oid for oid, t in results.items() if t < NOW - 30 * 60 and "quittiert" not in steps.get(oid, {})]
        self.assertGreaterEqual(len(overdue), 1)
        for oid in overdue:
            self.assertIn("eskaliert", steps[oid])
        acked = [s["quittiert"][1]["minutes"] for s in steps.values() if "quittiert" in s]
        acked.sort()
        self.assertTrue(5 <= acked[len(acked) // 2] <= 20, acked[len(acked) // 2])
        for oid, got in steps.items():
            if oid not in results:
                self.assertLess(min(w for w, _ in got.values()), NOW - 7 * 3600 + 240 * 60, oid)

    def test_more_than_30_sources(self):
        self.assertGreaterEqual(len(EVENT_SOURCETYPES | METRICS_ONLY), 30)

    def test_event_times_in_window(self):
        for t, *_ in self.events + self.metrics:
            self.assertLessEqual(t, NOW)
            self.assertGreaterEqual(t, NOW - 7 * 3600 - 61)

    def test_json_serialisable(self):
        for e in self.events[:20000]:
            json.dumps(e[4])

    def test_metric_names_and_dimensions(self):
        prefixes = set()
        for t, src, host, fields in self.metrics:
            names = [k for k in fields if k.startswith("metric_name:")]
            self.assertTrue(names)
            for k in names:
                name = k.split(":", 1)[1]
                self.assertTrue(name.startswith("sakh."), name)
                self.assertIsInstance(fields[k], (int, float))
                self.assertNotIsInstance(fields[k], bool)
                prefixes.add(name.rsplit(".", 1)[0] + ".")
            for k, v in fields.items():
                if not k.startswith("metric_name:"):
                    self.assertIsInstance(v, str, k)
        for p in METRIC_PREFIXES:
            self.assertIn(p, prefixes)

    def test_icu_rhythms(self):
        rhythms = {e[4]["rhythm"] for e in self.events if e[1] == "sakh:pdms:vitals" and e[4].get("data_status") == "ok"}
        self.assertGreaterEqual(len(rhythms), 4, rhythms)
        self.assertLessEqual(rhythms, {"SR", "VHF", "VES", "LSB", "SM", "AVB1"})

    def test_change_snapshot(self):
        last = max(e[0] for e in self.events if e[1] == "snow:change_request")
        snap = [e[4] for e in self.events if e[1] == "snow:change_request" and e[0] == last]
        self.assertGreaterEqual(len(snap), 15)
        states = {c["state"] for c in snap}
        self.assertTrue({"Genehmigung", "Geplant", "Geschlossen"} <= states, states)
        self.assertEqual(len(snap), len({c["number"] for c in snap}))
        self.assertGreaterEqual(len({e[0] for e in self.events if e[1] == "snow:change_request"}), 7 * 4)

    def test_dimensions_per_family(self):
        need = {"sakh.server.": "host", "sakh.db.": "instance", "sakh.hl7.": "channel", "sakh.te.": "agent",
                "sakh.mri.": "device_id", "sakh.beds.": "ward", "sakh.blood.": "blood_group", "sakh.vmware.": "cluster"}
        for t, src, host, fields in self.metrics:
            for k in fields:
                for prefix, dim in need.items():
                    if k.startswith("metric_name:" + prefix):
                        self.assertIn(dim, fields, k)

    def test_direct_lines_match_transforms(self):
        dims_re = re.compile(r'"([A-Za-z_][\w.]*)":"([^"]*)"')
        val_re = re.compile(r'"_value":(-?[\d.]+(?:[eE][-+]?\d+)?)')
        fields = next(f for _t, _s, _h, f in self.metrics if "metric_name:sakh.mri.helium_level_pct" in f)
        lines = list(direct_lines(fields))
        self.assertEqual(len(lines), sum(1 for k in fields if k.startswith("metric_name:")))
        for line in lines:
            raw = json.dumps(line, separators=(",", ":"))
            pairs = dict(dims_re.findall(raw))
            self.assertIn("metric_name", pairs)
            self.assertEqual(pairs.get("device_id"), "MRT-1" if fields["device_id"] == "MRT-1" else fields["device_id"])
            self.assertTrue(val_re.search(raw), raw)

    def test_bed_counts_consistent(self):
        for t, st, src, host, d in self.events:
            if st == "sakh:kis:beds":
                self.assertEqual(d["beds_total"], d["occupied"] + d["free"] + d["cleaning"] + d["blocked"])
                self.assertIn(d["department"], H.DEPT)

    def test_no_patient_names(self):
        for t, st, src, host, d in self.events:
            if isinstance(d, dict):
                self.assertNotIn("patient_name", d)
                self.assertNotIn("name", d) if st.startswith("sakh:kis") else None


class Restart(unittest.TestCase):
    def test_snapshots_right_after_restart(self):
        start = NOW + 31 * 60 + 40
        events = []
        sim = Simulation(lambda t, st, src, host, data: events.append((t, st)), start_ts=start, prime=True)
        sim.run_until(start + 1)
        seen = {st for t, st in events}
        for st in ("sakh:bloodbank:inventory", "sakh:kis:beds", "cisco:dnac:devicehealth"):
            self.assertIn(st, seen)
        sim.run_until(NOW + 3600)
        blood = sorted({t for t, st in events if st == "sakh:bloodbank:inventory"})
        self.assertEqual([start, NOW + 40 * 60, NOW + 50 * 60, NOW + 3600], blood)


class Determinism(unittest.TestCase):
    def test_same_seed_same_data(self):
        _, a, ma = run(hours=0.5)
        _, b, mb = run(hours=0.5)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        self.assertEqual(len(ma), len(mb))

    def test_other_seed_differs(self):
        _, a, _ = run(hours=0.5)
        _, b, _ = run(hours=0.5, seed="other")
        self.assertNotEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_without_metric_callback_everything_is_an_event(self):
        _, ev, m = run(hours=0.25, metrics=False)
        self.assertFalse(m)
        self.assertTrue(METRICS_ONLY <= {e[1] for e in ev})


class Scenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sim, cls.events, cls.metrics = run(hours=2, scenarios=NAMES, onset_ago=3600)
        cls.late = [e for e in cls.events if e[0] > NOW - 600]
        cls.late_m = [m for m in cls.metrics if m[0] > NOW - 600]

    def last(self, st, pred=lambda d: True):
        xs = [e[4] for e in self.late if e[1] == st and isinstance(e[4], dict) and pred(e[4])]
        return xs[-1] if xs else None

    def test_flu_surge(self):
        s = self.last("sakh:ed:tracking", lambda d: d.get("type") == "status")
        self.assertEqual(s["ambulance_bypass"], 1)
        self.assertGreater(s["boarding"], 10)

    def test_blood_shortage(self):
        crit = {(d["product"], d["blood_group"]) for _t, st, _s, _h, d in self.late
                if st == "sakh:bloodbank:inventory" and d["status"] == "kritisch"}
        self.assertIn(("EK", "0-"), crit)
        self.assertIn(("EK", "A-"), crit)

    def test_mri_cooling(self):
        d = self.last("sakh:medtech:telemetry", lambda d: d["device_id"] == "MRT-1")
        self.assertEqual(d["status"], "Gesperrt")
        self.assertLess(d["helium_level_pct"], 80)
        he = [f["metric_name:sakh.mri.helium_level_pct"] for _t, _s, _h, f in self.late_m
              if f.get("device_id") == "MRT-1" and "metric_name:sakh.mri.helium_level_pct" in f]
        self.assertTrue(he and he[-1] < 80)

    def test_hl7_queue(self):
        d = self.last("sakh:hl7:engine", lambda d: d["channel"] == "LIS_KIS_ORU")
        self.assertGreater(d["queue_depth"], 200)
        undelivered = [e for e in self.late if e[1] == "sakh:lis:result" and not e[4]["delivered_to_kis"]]
        self.assertTrue(undelivered)
        fs = [f["metric_name:sakh.server.fs_data_used_pct"] for _t, _s, h, f in self.late_m
              if f.get("host") == "sakh-kom01" and "metric_name:sakh.server.fs_data_used_pct" in f]
        self.assertGreaterEqual(fs[-1], 99)

    def test_kis_db(self):
        d = self.last("sakh:db:performance", lambda d: d["instance"] == "KISPRD")
        self.assertEqual(d["status"], "kritisch")
        self.assertGreater(d["blocked_sessions"], 20)

    def test_network_building_c(self):
        down = {e[4]["DeviceName"] for e in self.late if e[1] == "cisco:dnac:devicehealth"
                and e[4]["Reachability"] == "Unreachable"}
        self.assertIn("sakh-c-dist01", down)
        self.assertTrue(any(e[4].get("status") == "Offline" for e in self.late if e[1] == "sakh:medtech:telemetry"))
        reach = [f["metric_name:sakh.network.reachable"] for _t, _s, _h, f in self.late_m
                 if f.get("device") == "sakh-c-dist01"]
        self.assertEqual(reach[-1], 0)

    def test_cisco_psirt(self):
        adv = [e for e in self.late if e[1] == "cisco:iq:advisory" and "sakhdemo" in e[4]["advisoryId"]]
        self.assertTrue(adv)
        self.assertTrue(any(e[1] == "snow:change_request" and e[4]["type"] == "Emergency"
                            and e[4].get("u_scenario") == "cisco_psirt" for e in self.events))

    def test_scenario_incidents_unique(self):
        nums = {}
        for e in self.events:
            if e[1] == "snow:incident" and e[4].get("u_scenario"):
                nums.setdefault(e[4]["number"], set()).add(e[4]["short_description"])
        self.assertTrue(nums)
        for n, descs in nums.items():
            self.assertEqual(len(descs), 1, n)

    def test_off_means_normal(self):
        _, ev, _ = run(hours=1)
        d = [e[4] for e in ev if e[1] == "sakh:medtech:telemetry" and e[4]["device_id"] == "MRT-1"][-1]
        self.assertEqual(d["status"] in ("in Betrieb", "Wartung"), True)
        self.assertFalse(any(e[1] == "cisco:iq:advisory" and "sakhdemo" in e[4]["advisoryId"] for e in ev))


def strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, dict):
        for x in v.values():
            yield from strings(x)
    elif isinstance(v, list):
        for x in v:
            yield from strings(x)


def shape(v):
    """Everything that must not change with the language: keys, numbers, booleans."""
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        return [shape(x) for x in v]
    return "s" if isinstance(v, str) else v


class Language(unittest.TestCase):
    GERMAN = re.compile(
        r"(?<![A-Za-z_\-])(und|nicht|oder|mit|fuer|bei|nach|ohne|Station|Haus|kritisch|Kritisch|niedrig|Gesperrt|"
        r"in Betrieb|Wartung|Notaufnahme|Intensiv|Intensivstation|Innere|Befund\w*|Labor|Warteschlange|Geraet\w*|Oberarzt|"
        r"Pflege\w*|Allgemeines|Krankenhaus|Wien|abgeschlossen|Stoerung|Abteilung|Telefon)(?![A-Za-z_\-])")

    @classmethod
    def setUpClass(cls):
        cls.de = run(hours=2, scenarios=NAMES)
        cls.en = run(hours=2, scenarios=NAMES, lang="en")

    def test_german_is_the_default(self):
        _, a, ma = run(hours=0.5)
        _, b, mb = run(hours=0.5, lang="de")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        self.assertEqual(json.dumps(ma, sort_keys=True), json.dumps(mb, sort_keys=True))

    def test_english_has_no_german(self):
        _, ev, m = self.en
        left = set()
        for _t, _st, src, _h, data in ev:
            for s in strings([src, data]):
                left |= {x.group(0) for x in self.GERMAN.finditer(s)}
        for _t, _src, _h, f in m:
            for s in strings(f):
                left |= {x.group(0) for x in self.GERMAN.finditer(s)}
        self.assertEqual(set(), left)

    def test_same_structure_in_both_languages(self):
        _, de, mde = self.de
        _, en, men = self.en
        self.assertEqual(len(de), len(en))
        for a, b in zip(de, en):
            self.assertEqual((a[0], a[1], a[3]), (b[0], b[1], b[3]))
            self.assertEqual(shape(a[4]), shape(b[4]))
        self.assertEqual([sorted(f) for *_x, f in mde], [sorted(f) for *_x, f in men])

    def test_english_deterministic(self):
        _, a, _ = run(hours=0.5, lang="en")
        _, b, _ = run(hours=0.5, lang="en")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_english_values(self):
        _, ev, _ = self.en
        inv = [e[4] for e in ev if e[1] == "sakh:bloodbank:inventory"]
        self.assertTrue(any(d["status"] == "critical" for d in inv))
        mri = [e[4] for e in ev if e[1] == "sakh:medtech:telemetry" and e[4]["device_id"] == "MRT-1"]
        self.assertEqual("Blocked", mri[-1]["status"])
        self.assertIn("bloodbank:stock", {e[2] for e in ev})

    def test_python_and_js_dictionary_are_one_file(self):
        from kis_sim import i18n
        table = i18n.load("en")
        self.assertTrue(table["phrases"] and table["patterns"])
        for de in table["phrases"]:
            self.assertEqual(de, de.strip(), de)


class InputsConf(unittest.TestCase):
    TA = os.path.join(BIN, "..")

    def spec(self):
        keys = set()
        with open(os.path.join(self.TA, "README", "inputs.conf.spec"), encoding="utf-8") as fh:
            for line in fh:
                m = re.match(r"^(\w+) =", line)
                if m and m.group(1) != "python":
                    keys.add(m.group(1))
        return keys

    def test_every_spec_key_is_a_form_field(self):
        with open(os.path.join(self.TA, "appserver/static/js/build/globalConfig.json"), encoding="utf-8") as fh:
            service = json.load(fh)["pages"]["inputs"]["services"][0]
        self.assertEqual(set(), self.spec() - {e["field"] for e in service["entity"]})

    def test_every_spec_key_has_a_default(self):
        with open(os.path.join(self.TA, "default", "inputs.conf"), encoding="utf-8") as fh:
            defaults = set(re.findall(r"^(\w+) =", fh.read(), re.M))
        self.assertEqual(set(), self.spec() - defaults)

    def test_english_indexes_shipped(self):
        with open(os.path.join(self.TA, "default", "indexes.conf"), encoding="utf-8") as fh:
            stanzas = set(re.findall(r"^\[(\w+)\]", fh.read(), re.M))
        self.assertEqual({"demo_sakh", "demo_sakh_metrics", "demo_sakh_en", "demo_sakh_en_metrics"}, stanzas)


class SchemeTest(unittest.TestCase):
    """splunkd refuses to initialise a modular input whose scheme declares a reserved argument."""

    RESERVED = {"index", "host", "source", "sourcetype", "interval", "disabled"}

    def test_no_reserved_scheme_arguments(self):
        with open(os.path.join(BIN, "kis_datagen.py"), encoding="utf-8") as fh:
            src = fh.read()
        declared = set(re.findall(r"smi\.Argument\(\s*'(\w+)'", src))
        declared |= set(re.findall(r"'(\w+)'", re.search(r"for arg in \(([^)]*)\)", src).group(1)))
        self.assertIn("metrics_index", declared)
        self.assertFalse(declared & self.RESERVED, declared & self.RESERVED)


if __name__ == "__main__":
    unittest.main()
