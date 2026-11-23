"""Rewrites globalConfig.json and openapi.json of TA-kis-datagen from the copied UCC 6.6.0 build output.

UCC itself is not needed: the UI reads globalConfig.json at runtime and the JS bundle is app-agnostic.
Run from the repository root:  python3 tools/rebuild_ucc_config.py
"""

import copy
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "TA-kis-datagen")
sys.path.insert(0, os.path.join(ROOT, "bin"))

from kis_sim.scenarios import SCENARIOS  # noqa: E402

APP = "TA-kis-datagen"
REST = "TA_kis_datagen"
VERSION = "1.0.0"
TITLE = "KIS Datagen (Splunk Allgemeines Krankenhaus SAKH)"

SCENARIO_HELP = {
    "flu_surge": "Notaufnahme-Zugaenge x2,5, Innere/Paediatrie/Intensiv voll, Boarding, Rettungsstopp, mehr Influenza-Tests.",
    "blood_shortage": "Erythrozytenkonzentrate 0 neg / A neg unter Mindestbestand, elektive OPs mit Blutbedarf werden abgesetzt.",
    "mri_cooling": "MRT-1 Kaltkopf- und Kompressorstoerung, Helium sinkt, Geraet gesperrt, MR-Termine auf MRT-2/MRT-3 umgeplant, P1-Incident.",
    "hl7_queue": "sakh-kom01 /data voll, HL7-Warteschlange LIS zum KIS waechst, Laborbefunde fehlen im KIS, Incidents.",
    "kis_db": "LKF-Export sperrt die Oracle KIS-Datenbank KISPRD, KIS-Antwortzeiten und ADT-Latenz steigen, Notfall-Change.",
    "network_building_c": "Netzteil- und CRC-Warnungen, dann Ausfall Distribution Haus C: Access-Switches/APs, Intensiv- und Notaufnahme-Geraete offline, PDMS-Luecken.",
    "cisco_psirt": "Kritische (synthetische) Cisco PSIRT fuer Catalyst 9200/9300 IOS XE 17.9, Cisco IQ zeigt betroffene Assets, Notfall-Change, spaeter verdaechtiger Web-UI-Login.",
}

ON_OFF = {"1": "An", "true": "An", "0": "Aus", "false": "Aus"}


def text(field, label, default, help_, pattern=None, msg=None, number=None):
    e = {"type": "text", "field": field, "label": label, "defaultValue": default, "required": True, "help": help_}
    v = []
    if pattern:
        v.append({"type": "regex", "pattern": pattern, "errorMsg": msg})
    if number:
        v.append({"type": "number", "range": list(number), "errorMsg": "%s - %s" % number})
    if v:
        e["validators"] = v
    return e


def build_global(gc):
    gc["meta"].update({"name": APP, "restRoot": REST, "version": VERSION, "displayName": TITLE})
    gc["pages"].pop("dashboard", None)
    conf = gc["pages"]["configuration"]
    conf["description"] = ("Schritt 1: Ziel fuer die Daten festlegen (HEC oder Direct). "
                           "Schritt 2: unter Inputs den Generator kis_datagen anlegen und einschalten.")
    for tab in conf["tabs"]:
        for e in tab["entity"]:
            if e.get("field") == "hec_token":
                e["help"] = ("Der Token muss die Indexe demo_sakh (Events) und demo_sakh_metrics (Metriken) "
                             "erlauben. Wird verschluesselt im Splunk Credential Store gespeichert.")
    inputs = gc["pages"]["inputs"]
    template = next(s for s in inputs["services"] if s["name"] == "coolashaker")
    name_entity = copy.deepcopy(template["entity"][0])
    interval = copy.deepcopy(next(e for e in template["entity"] if e["field"] == "interval"))
    interval["label"] = "Neustart-Pruefung (Sekunden)"
    interval["help"] = "Dauerhaft laufender Input: splunkd nutzt den Wert nur, um den Generator nach einem Absturz neu zu starten."
    entity = [name_entity, interval,
              text("index", "Event-Index", "demo_sakh", "Alle Ereignisse, Logs und Snapshots (KIS, Netzwerk, CMDB).",
                   r"^[a-zA-Z0-9][\w-]*$", "Buchstaben, Ziffern, _ und -"),
              text("metrics_index", "Metrik-Index", "demo_sakh_metrics",
                   "Index vom Typ metric fuer die Zeitreihen (Server, VMware, Datenbanken, HL7, ThousandEyes, "
                   "Medizintechnik, Betten, Blutdepot, Intensiv-Vitalwerte, Notaufnahme, eHealth, Pflege, Catalyst Health).",
                   r"^[a-zA-Z0-9][\w-]*$", "Buchstaben, Ziffern, _ und -"),
              text("timezone", "Zeitzone", "Europe/Vienna", "Tagesablaeufe (Dienste, OP-Plan, Notaufnahme-Spitzen) laufen in dieser Zone.",
                   r"^[A-Za-z_]+(/[A-Za-z_+-]+)*$", "IANA-Name, z.B. Europe/Vienna"),
              text("seed", "Seed", "sakh", "Gleicher Seed = gleiche Kurven nach Neustart und Backfill.",
                   r"^[\w-]{1,32}$", "1-32 Zeichen: Buchstaben, Ziffern, _ und -"),
              text("backfill_minutes", "Backfill beim ersten Start (Minuten)", "1440",
                   "1440 = ein Tag (rund 300.000 Events und 1,3 Mio. Metrik-Datenpunkte). 0 = nur Echtzeit. Laeuft nur beim ersten Start.",
                   number=(0, 10080)),
              text("max_gap_minutes", "Luecken fuellen bis (Minuten)", "30",
                   "Nach Stop/Start werden kuerzere Luecken nachgeneriert, laengere uebersprungen.", number=(0, 1440))]
    for name, label, _ramp in SCENARIOS:
        entity.append({"type": "checkbox", "field": "scenario_" + name, "label": "Szenario: " + label,
                       "defaultValue": 0,
                       "help": SCENARIO_HELP[name] + " Wirkt live nach ca. 10 s; Vorwarnsignale in den ersten 6 Minuten."})
    service = {"name": "kis_datagen", "title": "SAKH Krankenhaus (KIS, Medizintechnik, IT-Infrastruktur)",
               "inputHelperModule": "kis_datagen_helper", "entity": entity}
    inputs["services"] = [service]
    inputs["title"] = "Inputs"
    inputs["description"] = "Ein Input erzeugt alle Datenquellen des SAKH. Status-Schalter = Start / Stop."
    more = [{"label": "Event-Index", "field": "index"}, {"label": "Metrik-Index", "field": "metrics_index"},
            {"label": "Zeitzone", "field": "timezone"}, {"label": "Seed", "field": "seed"},
            {"label": "Backfill (Minuten)", "field": "backfill_minutes"},
            {"label": "Luecken fuellen (Minuten)", "field": "max_gap_minutes"}]
    for name, label, _ramp in SCENARIOS:
        more.append({"label": "Szenario: " + label, "field": "scenario_" + name, "mapping": ON_OFF})
    inputs["table"]["moreInfo"] = more
    return gc


def build_openapi(oa):
    raw = json.dumps(oa)
    raw = raw.replace("TA-bar-datagen", APP).replace("TA_bar_datagen", REST)
    oa = json.loads(raw)
    oa["info"].update({"title": APP, "version": VERSION, "description": TITLE})
    paths = {k: v for k, v in oa["paths"].items() if "_settings/" in k}
    for suffix in ("", "/{name}"):
        tpl = json.dumps(oa["paths"]["/%s_coolashaker%s" % (REST, suffix)])
        paths["/%s_kis_datagen%s" % (REST, suffix)] = json.loads(tpl.replace("coolashaker", "kis_datagen"))
    oa["paths"] = paths
    schemas = oa["components"]["schemas"]
    for k in list(schemas):
        if not k.startswith(("hec_setup", "logging")):
            del schemas[k]
    props = {"name": {"type": "string"}}
    for f in ("interval", "index", "metrics_index", "timezone", "seed", "backfill_minutes", "max_gap_minutes"):
        props[f] = {"type": "string"}
    for name, _l, _r in SCENARIOS:
        props["scenario_" + name] = {"type": "string", "enum": ["0", "1"]}
    props["disabled"] = {"type": "string", "enum": ["False", "True"]}
    schemas["kis_datagen"] = {"type": "object", "properties": props}
    schemas["kis_datagen_without_name"] = {"type": "object", "properties": {k: v for k, v in props.items() if k != "name"}}
    schemas["kis_datagen_without_disabled"] = {"type": "object",
                                               "properties": {k: v for k, v in props.items() if k != "disabled"}}
    return oa


def main():
    gpath = os.path.join(ROOT, "appserver", "static", "js", "build", "globalConfig.json")
    opath = os.path.join(ROOT, "appserver", "static", "openapi.json")
    with open(gpath) as fh:
        gc = json.load(fh)
    if gc["meta"]["name"] != APP:
        gc = build_global(gc)
        with open(gpath, "w") as fh:
            json.dump(gc, fh, indent=4, ensure_ascii=False)
    with open(opath) as fh:
        oa = json.load(fh)
    if "TA-bar-datagen" in json.dumps(oa):
        with open(opath, "w") as fh:
            json.dump(build_openapi(oa), fh, indent=4, ensure_ascii=False)
    print("ok", re.sub(r"\s+", " ", gc["meta"]["displayName"]))


if __name__ == "__main__":
    main()
