"""ServiceNow CMDB, asset management, incidents and changes."""

from datetime import timedelta

from . import hospital as H
from .util import poisson, rng, unit, weighted
from .clinical import ev

INSTANCE = "sakh.service-now.com"


def sys_id(*parts):
    return "%032x" % int(unit("sysid", *parts) * 2 ** 128)


def _date(ctx, ts, days):
    return (ctx.clock.local(ts) + timedelta(days=days)).strftime("%Y-%m-%d")


def cmdb(ctx, ts):
    """snow:cmdb_ci_* / snow:cmdb_rel_ci / snow:alm_asset - CMDB and asset snapshot every 6 hours."""
    if not (int(ts) % 21600 == 0 or ctx.first.get("cmdb")):
        return []
    ctx.first["cmdb"] = False
    out = []
    upd = ctx.clock.local(ts).strftime("%Y-%m-%d %H:%M:%S")

    def put(st, data):
        data["sys_updated_on"] = upd
        out.append(ev(ts, st, "snow:%s" % st.split(":", 1)[1], INSTANCE, data))

    for host, s in sorted(H.SERVER.items()):
        put("snow:cmdb_ci_server", {
            "sys_id": sys_id("srv", host), "name": host, "sys_class_name":
            "cmdb_ci_win_server" if s["family"] == "windows" else "cmdb_ci_linux_server",
            "os": s["os"], "short_description": s["role"], "u_application": s["application"],
            "ip_address": "10.10.%d.%d" % (10 + (unit("ipn", host) * 8) // 1, (unit("ip", host) * 250) // 1 + 2),
            "cpu_count": s["cores"], "ram": s["ram_gb"] * 1024, "location": H.BUILDING_NAME[s["building"]],
            "u_cluster": s["cluster"], "busines_criticality": s["criticality"], "operational_status": "Operational",
            "install_status": "Installed", "support_group": H.SUPPORT_GROUPS.get(s["application"], "Windows-Team"),
            "virtual": s["cluster"] != "physisch"})
    for d in H.NETWORK:
        put("snow:cmdb_ci_netgear", {
            "sys_id": sys_id("net", d["name"]), "name": d["name"], "sys_class_name": "cmdb_ci_ip_switch"
            if d["family"] == "Switches and Hubs" else "cmdb_ci_ip_router" if d["family"] == "Routers"
            else "cmdb_ci_wap_network" if d["family"] == "Unified AP" else "cmdb_ci_netgear",
            "manufacturer": "Cisco Systems", "model_id": d["model"], "serial_number": d["serial"],
            "ip_address": d["ip"], "firmware_version": d["software"], "location": d["location"],
            "u_building": d["building"], "u_role": d["role"], "operational_status":
            "Non-Operational" if ctx.m.device_down(d["name"], ts) else "Operational",
            "install_status": "Installed", "support_group": "Netzwerkteam"})
    for dev in H.DEVICES:
        put("snow:cmdb_ci_medical_device", {
            "sys_id": sys_id("med", dev["device_id"]), "name": dev["device_id"], "sys_class_name": "cmdb_ci_medical_device",
            "u_device_class": dev["device_class"], "manufacturer": dev["manufacturer"], "model_id": dev["model"],
            "serial_number": dev["serial"], "mac_address": dev["mac"], "u_department": dev["department"],
            "u_ward": dev["ward"], "location": H.BUILDING_NAME[dev["building"]], "u_network": dev["network"],
            "u_mdr_class": "IIb" if dev["device_type"] in ("VENT", "PUMP", "MRT", "CT", "ANGIO", "ANES") else "IIa",
            "operational_status": "Operational", "install_status": "Installed", "support_group": "Medizintechnik"})
    for name, crit, apps in H.BUSINESS_SERVICES:
        sid = sys_id("svc", name)
        put("snow:cmdb_ci_service", {"sys_id": sid, "name": name, "sys_class_name": "cmdb_ci_service_business",
                                      "busines_criticality": crit, "operational_status": "Operational",
                                      "owned_by": "Aerztliche Direktion" if crit == "kritisch" else "IT-Leitung",
                                      "support_group": H.SUPPORT_GROUPS.get(apps[0], "IT Service Desk")})
        for host, s in sorted(H.SERVER.items()):
            if s["application"] in apps:
                put("snow:cmdb_rel_ci", {"sys_id": sys_id("rel", name, host), "parent": name, "parent_class":
                                         "cmdb_ci_service_business", "child": host, "child_class": "cmdb_ci_server",
                                         "type": "Depends on::Used by"})
        if "Medizintechnik" in apps:
            for dev in H.DEVICES:
                if dev["department"] == "ICU" and dev["device_type"] in ("VENT", "MON"):
                    put("snow:cmdb_rel_ci", {"sys_id": sys_id("rel", name, dev["device_id"]), "parent": name,
                                             "parent_class": "cmdb_ci_service_business", "child": dev["device_id"],
                                             "child_class": "cmdb_ci_medical_device", "type": "Depends on::Used by"})
    for host, s in sorted(H.SERVER.items()):
        sw = "sakh-%s-dist01" % s["building"].lower() if s["cluster"] == "physisch" else \
            ("sakh-rz1-dc01" if s["cluster"] == "RZ1-Klinik" else "sakh-rz1-dc02")
        put("snow:cmdb_rel_ci", {"sys_id": sys_id("rel", host, sw), "parent": host, "parent_class": "cmdb_ci_server",
                                 "child": sw, "child_class": "cmdb_ci_netgear", "type": "Connected by::Connects"})
    for inst, engine, ver, host, app, size in H.DATABASES:
        put("snow:cmdb_rel_ci", {"sys_id": sys_id("rel", inst, host), "parent": "%s (%s)" % (inst, engine),
                                 "parent_class": "cmdb_ci_db_instance", "child": host, "child_class": "cmdb_ci_server",
                                 "type": "Runs on::Runs"})
    for dev in H.DEVICES:
        sw = next((d["name"] for d in H.NETWORK if d["building"] == dev["building"] and d["role"] == "ACCESS"
                   and d["family"] == ("Unified AP" if dev["network"] == "wlan" else "Switches and Hubs")), None)
        if sw and dev["device_type"] in ("MRT", "CT", "VENT", "MON", "LAB", "ANGIO"):
            put("snow:cmdb_rel_ci", {"sys_id": sys_id("rel", dev["device_id"], sw), "parent": dev["device_id"],
                                     "parent_class": "cmdb_ci_medical_device", "child": sw,
                                     "child_class": "cmdb_ci_netgear", "type": "Connected by::Connects"})
    assets = [(d["device_id"], d["manufacturer"], d["model"], d["serial"], d["department"], "Medizintechnik", d["install_year"],
               d["device_type"]) for d in H.DEVICES]
    assets += [(d["name"], "Cisco Systems", d["model"], d["serial"], "IT", "Netzwerk", 2019 + int(unit("ny", d["name"]) * 6), "NET")
               for d in H.NETWORK]
    assets += [(h, "Dell Technologies" if s["cluster"] == "physisch" else "VMware VM", s["role"], "SRV-%s" % h[-6:].upper(),
                "IT", "Server", 2020 + int(unit("sy", h) * 5), "SRV") for h, s in sorted(H.SERVER.items())]
    for name, maker, model, serial, dept, cat, year, kind in assets:
        r = rng(ctx.seed, "asset", name)
        cost = {"MRT": 1600000, "CT": 900000, "ANGIO": 1100000, "ROE": 180000, "US": 90000, "VENT": 38000,
                "MON": 14000, "PUMP": 3200, "ANES": 65000, "LAB": 250000, "NET": 6500, "SRV": 12000}[kind]
        data = {"asset_tag": "SAKH-%s" % name.upper(), "display_name": name, "model_category": cat,
                "manufacturer": maker, "model": model, "serial_number": serial, "cost_center": "KST-%s" % dept,
                "u_department": dept, "install_status": "In use", "purchase_date": "%d-%02d-15" % (year, r.randint(1, 12)),
                "cost": int(cost * (0.85 + 0.3 * r.random())), "currency": "EUR",
                "warranty_expiration": "%d-%02d-15" % (year + 5, r.randint(1, 12)),
                "depreciation_end": "%d-12-31" % (year + (8 if cat == "Medizintechnik" else 5))}
        if cat == "Medizintechnik":
            stk = r.randint(-25, 340)
            data.update({"u_stk_due": _date(ctx, ts, stk), "u_stk_days_left": stk,
                         "u_mtk_due": _date(ctx, ts, r.randint(-10, 700)) if kind in ("MON", "LAB", "VENT") else None,
                         "u_stk_status": "ueberfaellig" if stk < 0 else "faellig < 30 Tage" if stk < 30 else "ok",
                         "u_mpbv_relevant": True, "u_maintenance_contract": "%s Full Service" % maker})
        put("snow:alm_asset", data)
    return out


SCENARIO_TICKETS = {
    "flu_surge": [(1500, "Notaufnahme ueberlastet - Rettungsstopp angefordert, Bettenkoordination eskaliert", 2,
                   "Bettenmanagement", "sakh-kisapp02", "Klinische Dokumentation (KIS)", "Patientenversorgung")],
    "blood_shortage": [(900, "Blutdepot: EK 0 negativ und A negativ unter Mindestbestand - Eilbestellung Blutspendedienst", 1,
                        "Labor-IT", "sakh-bbapp01", "Blutversorgung", "Patientenversorgung")],
    "mri_cooling": [(420, "MRT-1 Kaltkopf/Kompressor-Stoerung, Heliumverlust - Geraet gesperrt, Siemens Service verstaendigt",
                     1, "Medizintechnik", "MRT-1", "Radiologie und Bildgebung", "Medizintechnik")],
    "hl7_queue": [(480, "Laborbefunde kommen nicht im KIS an - Stationen melden fehlende Werte", 2,
                   "IT Service Desk", "sakh-lisapp01", "Labordiagnostik", "Software"),
                  (600, "Kommunikationsserver sakh-kom01: Dateisystem /data voll, HL7-Warteschlange LIS_KIS_ORU waechst", 1,
                   "Schnittstellenteam", "sakh-kom01", "Labordiagnostik", "Infrastruktur")],
    "kis_db": [(420, "KIS extrem langsam auf allen Stationen - Aufnahmen dauern Minuten", 1, "KIS-Applikationsbetreuung",
                "sakh-kisapp01", "Klinische Dokumentation (KIS)", "Software"),
               (600, "Oracle KISPRD: Sperrkonflikte durch LKF-Export waehrend der Tagesarbeitszeit", 2, "DBA-Team",
                "sakh-kisdb01", "Klinische Dokumentation (KIS)", "Datenbank")],
    "network_building_c": [(540, "Netzwerkausfall Haus C - Intensivstation und Notaufnahme ohne KIS/PDMS, Geraete offline", 1,
                            "Netzwerkteam", "sakh-c-dist01", "Intensivmedizin (PDMS)", "Netzwerk")],
    "cisco_psirt": [(900, "Kritische Cisco PSIRT cisco-sa-iosxe-sakhdemo-2026 betrifft Catalyst 9200/9300", 2,
                     "IT-Security (SOC)", "sakh-a-acc01", "Klinische Dokumentation (KIS)", "Security"),
                    (1560, "Verdaechtiger Web-UI Login auf Access-Switch aus dem Internet - moegliche Kompromittierung", 1,
                     "IT-Security (SOC)", "sakh-a-acc01", "Klinische Dokumentation (KIS)", "Security")],
}

BACKGROUND = [
    ("Drucker auf Station druckt keine Etiketten", 4, "IT Service Desk", "sakh-print01", "Klinische Dokumentation (KIS)", "Hardware"),
    ("Citrix-Sitzung friert ein", 3, "Windows-Team", "sakh-cvda02", "Klinische Dokumentation (KIS)", "Software"),
    ("Passwort-Reset KIS-Benutzer", 4, "IT Service Desk", "sakh-dc01", "Klinische Dokumentation (KIS)", "Zugang"),
    ("Infusionspumpe zeigt Kommunikationsfehler", 3, "Medizintechnik", "PUMP-0012", "Intensivmedizin (PDMS)", "Medizintechnik"),
    ("e-card Steckfehler an Aufnahme", 3, "Schnittstellenteam", "sakh-elga01", "ELGA und eHealth", "Software"),
    ("WLAN schwach in Patientenzimmern", 4, "Netzwerkteam", "sakh-b-ap07", "Klinische Dokumentation (KIS)", "Netzwerk"),
    ("PACS Viewer laedt Bilder langsam", 3, "Radiologie-IT", "sakh-pacsweb01", "Radiologie und Bildgebung", "Software"),
    ("Lichtruf-Anzeige im Stationszimmer ausgefallen", 2, "Haustechnik", "sakh-ruf01", "Lichtruf und Patientensicherheit", "Hardware"),
    ("Patientenportal Terminbuchung fehlerhaft", 4, "Web-Team", "sakh-portal01", "Patientenportal", "Software"),
    ("Laboranalysator meldet QC-Fehler", 3, "Labor-IT", "LAB-CHEM-1", "Labordiagnostik", "Medizintechnik"),
]
STATES = {1: "Neu", 2: "In Bearbeitung", 6: "Geloest"}


def _inc(t, ctx, number, desc, prio, group, ci, svc, cat, state, opened, resolved=None, extra=None):
    data = {"number": number, "short_description": desc, "priority": prio,
            "priority_label": {1: "1 - Kritisch", 2: "2 - Hoch", 3: "3 - Mittel", 4: "4 - Niedrig"}[prio],
            "state": STATES[state], "assignment_group": group, "cmdb_ci": ci, "business_service": svc,
            "category": cat, "opened_at": ctx.clock.local(opened).strftime("%Y-%m-%d %H:%M:%S"),
            "resolved_at": ctx.clock.local(resolved).strftime("%Y-%m-%d %H:%M:%S") if resolved else None,
            "caller": "Station" if cat != "Security" else "Splunk Enterprise Security"}
    if extra:
        data.update(extra)
    return ev(t, "snow:incident", "snow:incident", INSTANCE, data)


def incidents(ctx, ts):
    """snow:incident - background tickets and scenario-driven incidents."""
    out = []
    hour = int(ts // 3600)
    for hb in range(hour - 48, hour + 1):
        r = rng(ctx.seed, "inc", hb)
        h = ctx.clock.hour(hb * 3600)
        for i in range(poisson(r, 0.3 + 1.6 * (1 if 7 <= h < 18 else 0))):
            opened = hb * 3600 + r.random() * 3600
            desc, prio, group, ci, svc, cat = r.choice(BACKGROUND)
            number = "INC%07d" % (hb % 100000 * 10 + i)
            dur = r.uniform(0.3, 30) * 3600 * (0.3 if prio <= 2 else 1)
            if ts - 60 < opened <= ts:
                out.append(_inc(opened, ctx, number, desc, prio, group, ci, svc, cat, 1, opened))
            if ts - 60 < opened + 900 <= ts:
                out.append(_inc(opened + 900, ctx, number, desc, prio, group, ci, svc, cat, 2, opened))
            if ts - 60 < opened + dur <= ts:
                out.append(_inc(opened + dur, ctx, number, desc, prio, group, ci, svc, cat, 6, opened, opened + dur))
    for si, (name, tickets) in enumerate(SCENARIO_TICKETS.items()):
        t0 = ctx.scen.onset.get(name)
        if t0 is None:
            continue
        for k, (delay, desc, prio, group, ci, svc, cat) in enumerate(tickets):
            number = "INC9%06d" % (int(t0) // 60 % 10000 * 100 + si * 10 + k)
            extra = {"u_scenario": name, "major_incident": prio == 1}
            if ctx.scen.crossed(name, delay, ts, 60):
                out.append(_inc(ts, ctx, number, desc, prio, group, ci, svc, cat, 1, t0 + delay, extra=extra))
            for upd in range(1, 48):
                if ctx.scen.crossed(name, delay + upd * 1800 - 1500, ts, 60):
                    out.append(_inc(ts, ctx, number, desc, prio, group, ci, svc, cat, 2, t0 + delay, extra=extra))
    return out


CHANGES = [
    ("Windows Patchday Server Gruppe 2", "Normal", "Windows-Team", "sakh-file01"),
    ("KIS Release 26.4 Hotfix 3", "Normal", "KIS-Applikationsbetreuung", "sakh-kisapp01"),
    ("Firmware-Update Infusionspumpen Haus B", "Normal", "Medizintechnik", "PUMP-0150"),
    ("Erweiterung VLAN Medizintechnik Haus D", "Standard", "Netzwerkteam", "sakh-d-dist01"),
    ("Oracle Quarterly Patch KISSTBY", "Normal", "DBA-Team", "sakh-kisdb02"),
    ("Zertifikatstausch ELGA GDA-Gateway", "Standard", "Schnittstellenteam", "sakh-elga01"),
]


def changes(ctx, ts):
    """snow:change_request - planned changes and emergency changes."""
    out = []
    day = int(ts // 86400)
    for db in (day - 1, day):
        r = rng(ctx.seed, "chg", db)
        for i in range(r.randint(1, 4)):
            created = db * 86400 + r.uniform(6, 16) * 3600
            desc, typ, group, ci = r.choice(CHANGES)
            if ts - 60 < created <= ts:
                start = created + r.uniform(1, 5) * 86400
                out.append(ev(created, "snow:change_request", "snow:change_request", INSTANCE, {
                    "number": "CHG%07d" % (db % 100000 * 10 + i), "short_description": desc, "type": typ,
                    "state": "Genehmigung", "risk": weighted(r, [("Niedrig", 0.6), ("Mittel", 0.35), ("Hoch", 0.05)]),
                    "assignment_group": group, "cmdb_ci": ci,
                    "start_date": ctx.clock.local(start).strftime("%Y-%m-%d %H:%M:%S"),
                    "end_date": ctx.clock.local(start + 7200).strftime("%Y-%m-%d %H:%M:%S")}))
    sc = ctx.scen
    if sc.crossed("cisco_psirt", 1200, ts, 60):
        affected = [d["name"] for d in H.NETWORK if d["model"].startswith(("C9300", "C9200")) and d["software"].startswith("17.9")]
        out.append(ev(ts, "snow:change_request", "snow:change_request", INSTANCE, {
            "number": "CHG9%06d" % (int(sc.onset["cisco_psirt"]) % 1000000), "type": "Emergency",
            "short_description": "Notfall-Upgrade IOS XE 17.9.7 auf %d Catalyst Access-Switches (PSIRT)" % len(affected),
            "state": "Genehmigt", "risk": "Hoch", "assignment_group": "Netzwerkteam", "cmdb_ci": ", ".join(affected[:10]),
            "affected_count": len(affected), "start_date": ctx.clock.local(ts + 3600).strftime("%Y-%m-%d %H:%M:%S"),
            "end_date": ctx.clock.local(ts + 5 * 3600).strftime("%Y-%m-%d %H:%M:%S"), "u_scenario": "cisco_psirt"}))
    if sc.crossed("kis_db", 900, ts, 60):
        out.append(ev(ts, "snow:change_request", "snow:change_request", INSTANCE, {
            "number": "CHG9%06d" % (int(sc.onset["kis_db"]) % 1000000), "type": "Emergency",
            "short_description": "LKF-Export abbrechen und in Nachtfenster verschieben", "state": "Implementierung",
            "risk": "Mittel", "assignment_group": "DBA-Team", "cmdb_ci": "sakh-kisdb01", "u_scenario": "kis_db"}))
    return out


GENERATORS = [
    ("cmdb", 900, cmdb),
    ("incidents", 60, incidents),
    ("changes", 60, changes),
]
