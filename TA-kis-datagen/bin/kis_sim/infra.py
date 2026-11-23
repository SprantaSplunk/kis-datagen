"""IT infrastructure, network (Cisco) and medical device telemetry."""

from . import hospital as H
from .util import bump, clamp, noise, office, poisson, rng, unit, weighted
from .clinical import ev

DOMAIN = "sakh.local"


# ------------------------------------------------------------------- Catalyst Center
def _net_health(ctx, d, ts):
    m = ctx.m
    name = d["name"]
    down = m.device_down(name, ts)
    lead = m.lead("network_building_c", ts)
    score = 9 + (1 if unit(ctx.seed, "hs", name, int(ts // 3600)) > 0.3 else 0)
    if unit(ctx.seed, "hs-bad", name) < 0.06:
        score -= 3
    cpu = 12 + 10 * unit(ctx.seed, "cpu", name) + 6 * noise(ctx.seed, "cpu-" + name, ts, 900)
    if name == "sakh-c-dist01" and lead > 0 and not down:
        score = min(score, 4)
        cpu += 35 * lead
    if d["building"] == "C" and d["role"] == "ACCESS" and lead > 0.5 and not down:
        score = min(score, 6)
    if m.impact("cisco_psirt", ts) > 0.5 and d["model"].startswith(("C9300", "C9200")) and d["software"].startswith("17.9"):
        score = min(score, 7)
    return down, score, cpu


def dnac_health(ctx, ts):
    """cisco:dnac:devicehealth - Catalyst Center device health (5 min, APs every 15 min)."""
    out = []
    for d in H.NETWORK:
        if not d["managed"]:
            continue
        if d["family"] == "Unified AP" and int(ts) % 900 != 0:
            continue
        down, score, cpu = _net_health(ctx, d, ts)
        r = rng(ctx.seed, "dnac", d["name"], int(ts))
        data = {"DeviceName": d["name"], "IPAddress": d["ip"], "DeviceFamily": d["family"],
                "DeviceType": d["model"], "Role": d["role"], "Location": d["location"],
                "Building": d["building"], "SoftwareVersion": d["software"], "SerialNumber": d["serial"],
                "Reachability": "Unreachable" if down else "Reachable",
                "HealthScore": 0 if down else int(score), "CPUUtilization": None if down else round(cpu, 1),
                "MemoryUtilization": None if down else round(38 + 12 * unit(ctx.seed, "mem", d["name"]) + 3 * r.random(), 1),
                "IssueCount": (2 if down else 0) + (1 if score < 7 else 0)}
        if d["family"] == "Unified AP":
            bld_load = office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
            data["ClientCount"] = 0 if down else int(8 + 30 * bld_load * unit(ctx.seed, "apc", d["name"]) + r.randint(0, 5))
            data["ChannelUtilization"] = None if down else int(15 + 40 * bld_load * r.random())
        else:
            data["InterfaceErrors"] = 0 if down else int(r.random() * 3 + (900 * ctx.m.lead("network_building_c", ts)
                                                                         if d["name"] == "sakh-c-dist01" else 0))
            data["UplinkStatus"] = "down" if down else "up"
        out.append(ev(ts, "cisco:dnac:devicehealth", "catalyst_center:devicehealth", "sakh-dnac01", data))
    return out


def dnac_issue(ctx, ts):
    """cisco:dnac:issue - Catalyst Center assurance issues."""
    m = ctx.m
    out = []
    sc = ctx.scen

    def issue(t, iid, name, prio, device, cat, desc, status="active"):
        d = H.NET.get(device, {})
        out.append(ev(t, "cisco:dnac:issue", "catalyst_center:issue", "sakh-dnac01", {
            "IssueID": iid, "Name": name, "Priority": prio, "Status": status, "DeviceName": device,
            "DeviceRole": d.get("role"), "Category": cat, "Building": d.get("building"),
            "SiteHierarchy": d.get("location"), "Description": desc}))

    if sc.crossed("network_building_c", 60, ts, 60):
        issue(ts, "ISS-C-PSU", "Power supply failure", "P2", "sakh-c-dist01", "Device",
              "Netzteil PS-2 meldet Fehler, Redundanz verloren")
    if sc.crossed("network_building_c", 180, ts, 60):
        issue(ts, "ISS-C-CRC", "Interface CRC errors increasing", "P2", "sakh-c-dist01", "Connectivity",
              "TenGigabitEthernet1/1/1 Uplink zu sakh-rz1-core01: CRC-Fehler steigen")
    if sc.crossed("network_building_c", 480, ts, 60):
        issue(ts, "ISS-C-DOWN", "Network device unreachable", "P1", "sakh-c-dist01", "Availability",
              "Distribution-Switch Haus C nicht erreichbar - Access-Switches und Access Points Haus C betroffen")
        for d in H.NETWORK:
            if d["building"] == "C" and d["role"] == "ACCESS" and d["family"] == "Switches and Hubs":
                issue(ts, "ISS-C-%s" % d["name"][-5:].upper(), "Network device unreachable", "P1", d["name"],
                      "Availability", "Access-Switch nicht erreichbar (Uplink verloren)")
    if sc.crossed("cisco_psirt", 600, ts, 60):
        for d in H.NETWORK:
            if d["model"].startswith(("C9300", "C9200")) and d["software"].startswith("17.9"):
                issue(ts, "ISS-PSIRT-%s" % d["name"].upper(), "Security advisory impacts device", "P1", d["name"],
                      "Security", "PSIRT cisco-sa-iosxe-sakhdemo-2026: Geraet betroffen, Upgrade erforderlich")
    r = rng(ctx.seed, "issue", int(ts))
    if r.random() < 0.004:
        d = r.choice([x for x in H.NETWORK if x["managed"]])
        name, cat = r.choice([("AP radio high utilization", "Connectivity"), ("High CPU utilization", "Device"),
                              ("Wireless client onboarding failures", "Onboarding"),
                              ("Interface flapping", "Connectivity")])
        issue(ts, "ISS-%08X" % r.randint(0, 2 ** 32 - 1), name, "P3" if r.random() < 0.6 else "P4", d["name"], cat,
              "Automatisch erkannt durch Assurance")
    return out


SYSLOG_NOISE = [
    "%SYS-5-CONFIG_I: Configured from console by netadmin on vty0 (10.10.5.20)",
    "%SEC_LOGIN-5-LOGIN_SUCCESS: Login Success [user: netadmin] [Source: 10.10.5.20] [localport: 22]",
    "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/{p}, changed state to up",
    "%LINK-3-UPDOWN: Interface GigabitEthernet1/0/{p}, changed state to up",
    "%DOT1X-5-SUCCESS: Authentication successful for client (001b.{m}) on Interface Gi1/0/{p}",
    "%MAB-5-SUCCESS: Authentication successful for client (001b.{m}) on Interface Gi1/0/{p}",
    "%ILPOWER-5-POWER_GRANTED: Interface Gi1/0/{p}: Power granted",
    "%SW_MATM-4-MACFLAP_NOTIF: Host 001b.{m} in vlan 220 is flapping between port Gi1/0/{p} and port Gi1/0/{q}",
]


def ios_syslog(ctx, ts):
    """cisco:ios - raw IOS XE syslog."""
    m = ctx.m
    sc = ctx.scen
    r = rng(ctx.seed, "ios", int(ts))
    out = []
    seq = int(ts) % 1000000

    def line(t, host, msg, sev=5):
        d = H.NET[host]
        lt = ctx.clock.local(t)
        stamp = lt.strftime("%b %d %H:%M:%S.") + "%03d" % int((t % 1) * 1000) + " " + (lt.tzname() or "CET")
        out.append(ev(t, "cisco:ios", "udp:514", d["ip"],
                      "<%d>%d: %s: %s: %s" % (184 + sev, seq + len(out), host, stamp, msg)))

    pool = [d["name"] for d in H.NETWORK if d["family"] in ("Switches and Hubs", "Routers") and d["managed"]
            and not m.device_down(d["name"], ts)]
    for _ in range(poisson(r, 2.2)):
        host = r.choice(pool)
        msg = r.choice(SYSLOG_NOISE).format(p=r.randint(1, 48), q=r.randint(1, 48), m="%02x%02x.%04x" % (
            r.randint(0, 255), r.randint(0, 255), r.randint(0, 65535)))
        line(ts - r.random() * 60, host, msg, 5 if "-5-" in msg else 3 if "-3-" in msg else 4)
    if sc.crossed("network_building_c", 60, ts, 60):
        line(ts, "sakh-c-dist01", "%PLATFORM_PM-3-PS_FAIL: Power supply 2 failure detected", 3)
        line(ts, "sakh-c-dist01", "%ENVIRONMENTAL-1-ALERT: PS2, Status: Fault, Location: R0", 1)
    if 0 < m.lead("network_building_c", ts) < 1 and r.random() < 0.6:
        line(ts, "sakh-c-dist01", "%ETHER_SERVICE-6-ERR_DISABLED: crc errors exceeded threshold on Te1/1/1", 6)
        line(ts, "sakh-c-dist01", "%PM-4-ERR_RECOVERY: Te1/1/1 interface errors: input errors %d, CRC %d" % (
            r.randint(1000, 9000), r.randint(800, 8000)), 4)
    if sc.crossed("network_building_c", 470, ts, 60):
        line(ts, "sakh-c-dist01", "%STACKMGR-1-RELOAD: Reloading due to reason: Stack Merge (SVL link lost)", 1)
        line(ts, "sakh-rz1-core01", "%LINEPROTO-5-UPDOWN: Line protocol on Interface TenGigabitEthernet1/0/13, changed state to down", 5)
        line(ts, "sakh-rz1-core01", "%LINK-3-UPDOWN: Interface TenGigabitEthernet1/0/13, changed state to down", 3)
        line(ts, "sakh-rz1-core02", "%LINK-3-UPDOWN: Interface TenGigabitEthernet1/0/13, changed state to down", 3)
        line(ts, "sakh-rz1-core01", "%OSPF-5-ADJCHG: Process 1, Nbr 10.50.0.1 on Vlan500 from FULL to DOWN, Neighbor Down: Dead timer expired", 5)
    if sc.crossed("cisco_psirt", 1500, ts, 60):
        victim = next(d["name"] for d in H.NETWORK if d["model"].startswith("C9300") and d["software"].startswith("17.9"))
        line(ts, victim, "%WEBUI-6-INSTALL_OPERATION_INFO: User: unknown, Install Operation: ADD", 6)
        line(ts + 5, victim, "%SEC_LOGIN-5-LOGIN_SUCCESS: Login Success [user: cisco_sup0rt] [Source: 203.0.113.77] [localport: 443]", 5)
        line(ts + 8, victim, "%SYS-5-CONFIG_P: Configured programmatically by process SEP_webui_wsma_http from console as cisco_sup0rt on vty31", 5)
    return out


# ------------------------------------------------------------------- Cisco IQ
ADVISORIES = [
    {"advisoryId": "cisco-sa-iosxe-snmp-demo-2026", "title": "Cisco IOS XE Software SNMP Denial of Service (Demo)",
     "severity": "High", "cvss": 7.7, "cves": ["CVE-2026-99101"], "models": ("C9300", "C9200", "C9500"),
     "versions": ("17.9",), "fixed": "17.9.6"},
    {"advisoryId": "cisco-sa-wlc-capwap-demo-2026", "title": "Cisco IOS XE Wireless Controller CAPWAP DoS (Demo)",
     "severity": "Medium", "cvss": 5.8, "cves": ["CVE-2026-99102"], "models": ("C9800",), "versions": ("17.12",),
     "fixed": "17.12.5"},
    {"advisoryId": "cisco-sa-ise-xss-demo-2026", "title": "Cisco ISE Stored Cross-Site Scripting (Demo)",
     "severity": "Medium", "cvss": 5.4, "cves": ["CVE-2026-99103"], "models": ("SNS",), "versions": ("3.3",),
     "fixed": "3.3 Patch 4"},
    {"advisoryId": "cisco-sa-ap-legacy-demo-2026", "title": "Cisco Aironet 2800 Series Wave 2 AP Vulnerability (Demo)",
     "severity": "High", "cvss": 8.1, "cves": ["CVE-2026-99104"], "models": ("AIR-AP2802",), "versions": ("8.10",),
     "fixed": "kein Fix - Hardware ersetzen"},
    {"advisoryId": "cisco-sa-ftd-vpn-demo-2026", "title": "Cisco Secure Firewall Threat Defense VPN DoS (Demo)",
     "severity": "High", "cvss": 8.6, "cves": ["CVE-2026-99105"], "models": ("FPR3110",), "versions": ("7.4",),
     "fixed": "7.4.3"},
]
PSIRT = {"advisoryId": "cisco-sa-iosxe-sakhdemo-2026",
         "title": "Cisco IOS XE Software Web UI Privilege Escalation (Demo-Szenario)", "severity": "Critical",
         "cvss": 10.0, "cves": ["CVE-2026-99999"], "models": ("C9300", "C9200"), "versions": ("17.9",),
         "fixed": "17.9.7"}
FIELD_NOTICES = [
    {"fieldNoticeId": "FN-74001", "title": "C9300 Netzteil PWR-C1-1100WAC kann ausfallen (Demo)", "models": ("C9300", "C9500")},
    {"fieldNoticeId": "FN-74002", "title": "Zertifikatsablauf auf AP 2800/3800 Serie (Demo)", "models": ("AIR-AP2802",)},
    {"fieldNoticeId": "FN-74003", "title": "C9800 Smart Licensing Hinweis (Demo)", "models": ("C9800",)},
]


def _lifecycle(d):
    model = d["model"]
    if model.startswith("AIR-AP2802"):
        return {"lifecycleStage": "End of Support", "endOfSaleDate": "2022-10-31", "lastDateOfSupport": "2027-10-31",
                "endOfSwMaintenanceDate": "2025-10-31"}
    if model.startswith("C9200"):
        return {"lifecycleStage": "End of Sale", "endOfSaleDate": "2025-07-30", "lastDateOfSupport": "2030-07-31",
                "endOfSwMaintenanceDate": "2028-07-30"}
    return {"lifecycleStage": "Active", "endOfSaleDate": None, "lastDateOfSupport": None,
            "endOfSwMaintenanceDate": None}


def _contract(ctx, d):
    u = unit(ctx.seed, "contract", d["name"])
    if u < 0.08:
        return {"coverageStatus": "Not Covered", "contractNumber": None, "serviceLevel": None, "coverageEndDate": None}
    if d["role"] in ("CORE", "DATA CENTER", "FIREWALL", "NAC", "BORDER ROUTER", "DISTRIBUTION"):
        return {"coverageStatus": "Covered", "contractNumber": "SNTC-209881", "serviceLevel": "SNTC 24x7x4",
                "coverageEndDate": "2027-12-31"}
    if u < 0.2:
        return {"coverageStatus": "Expiring", "contractNumber": "SNTC-188402", "serviceLevel": "SNTC 8x5xNBD",
                "coverageEndDate": "2026-12-31"}
    return {"coverageStatus": "Covered", "contractNumber": "SNTC-188403", "serviceLevel": "SNTC 8x5xNBD",
            "coverageEndDate": "2028-06-30"}


def _affected(adv, d):
    return d["model"].startswith(adv["models"]) and d["software"].startswith(adv["versions"])


def cisco_iq(ctx, ts):
    """cisco:iq:* - assets, advisories, field notices and contracts (6 h, PSIRT scenario every 15 min)."""
    m = ctx.m
    psirt = m.lead("cisco_psirt", ts) >= 1.0
    full = int(ts) % 21600 == 0 or ctx.first.get("cisco_iq")
    ctx.first["cisco_iq"] = False
    out = []
    host = "iq.cisco.com"
    if full:
        for d in H.NETWORK:
            data = {"hostname": d["name"], "productId": d["model"], "productFamily": d["series"],
                    "serialNumber": d["serial"], "softwareVersion": d["software"], "ipAddress": d["ip"],
                    "role": d["role"], "location": d["location"], "building": d["building"],
                    "managedBy": "Catalyst Center" if d["managed"] else "Direkt"}
            data.update(_lifecycle(d))
            data.update(_contract(ctx, d))
            out.append(ev(ts, "cisco:iq:asset", "cisco_iq:assets", host, data))
            for fn in FIELD_NOTICES:
                if d["model"].startswith(fn["models"]):
                    out.append(ev(ts, "cisco:iq:fieldnotice", "cisco_iq:fieldnotices", host, {
                        "fieldNoticeId": fn["fieldNoticeId"], "title": fn["title"], "hostname": d["name"],
                        "productId": d["model"], "serialNumber": d["serial"],
                        "status": "Potentially Vulnerable" if unit(ctx.seed, "fn", fn["fieldNoticeId"], d["name"]) < 0.7
                        else "Not Vulnerable"}))
        contracts = {}
        for d in H.NETWORK:
            c = _contract(ctx, d)
            key = c["contractNumber"] or "ohne Vertrag"
            contracts.setdefault(key, {"contractNumber": key, "serviceLevel": c["serviceLevel"],
                                       "coverageEndDate": c["coverageEndDate"], "status": c["coverageStatus"],
                                       "devicesCovered": 0})
            contracts[key]["devicesCovered"] += 1
        for c in contracts.values():
            out.append(ev(ts, "cisco:iq:contract", "cisco_iq:contracts", host, c))
    advs = list(ADVISORIES) if full else []
    if psirt and (full or int(ts) % 900 == 0):
        advs.append(PSIRT)
    for adv in advs:
        for d in H.NETWORK:
            if not _affected(adv, d):
                continue
            out.append(ev(ts, "cisco:iq:advisory", "cisco_iq:advisories", host, {
                "advisoryId": adv["advisoryId"], "title": adv["title"], "severity": adv["severity"],
                "cvssBaseScore": adv["cvss"], "cves": adv["cves"], "hostname": d["name"], "productId": d["model"],
                "softwareVersion": d["software"], "fixedVersion": adv["fixed"], "status": "Vulnerable",
                "building": d["building"], "synthetic": True,
                "firstPublished": ctx.clock.iso(ctx.scen.onset["cisco_psirt"] + 360) if adv is PSIRT else "2026-09-24T16:00:00+02:00"}))
    return out


# ------------------------------------------------------------------- Cisco ISE
PROFILES = [("B-Braun-Infusomat", "Medizingeraete", "MEDTECH_VLAN", 0.32), ("Philips-IntelliVue", "Medizingeraete",
            "MEDTECH_VLAN", 0.14), ("Draeger-Ventilator", "Medizingeraete", "MEDTECH_VLAN", 0.05),
            ("Windows10-Workstation", "Domain_Computers", "KLINIK_VLAN", 0.25), ("Apple-iPhone", "Mitarbeiter_BYOD",
            "GUEST_VLAN", 0.1), ("Cisco-IP-Phone", "IP_Phones", "VOICE_VLAN", 0.1), ("Zebra-Printer", "Drucker",
            "PRINT_VLAN", 0.04)]


def ise(ctx, ts):
    """cisco:ise:syslog - RADIUS authentications incl. medical device profiling."""
    m = ctx.m
    r = rng(ctx.seed, "ise", int(ts))
    out = []
    nads = [d for d in H.NETWORK if d["role"] == "ACCESS" and d["family"] == "Switches and Hubs"]
    down = m.building_c_down(ts)
    lead = m.lead("network_building_c", ts)
    recover = ctx.scen.crossed("network_building_c", 0, ts, 60)
    lam = 3.0 * (0.5 + office(ctx.clock.hour(ts), ctx.clock.weekday(ts)))
    for i in range(poisson(r, lam)):
        nad = r.choice(nads)
        t = ts - r.random() * 60
        prof, grp, authz, _ = weighted(r, [(p, p[3]) for p in PROFILES])
        mac = "00-1B-%02X-%02X-%02X-%02X" % tuple(r.randint(0, 255) for _ in range(4))
        server = "sakh-ise01" if r.random() < 0.6 else "sakh-ise02"
        fail = r.random() < 0.03
        if nad["building"] == "C" and down:
            continue
        if nad["building"] == "C" and 0.4 < lead < 1 and r.random() < 0.5:
            fail = True
        code, cat, text = ("5400", "CISE_Failed_Attempts", "Authentication failed") if fail else \
            ("5200", "CISE_Passed_Authentications", "Authentication succeeded")
        stamp = ctx.clock.local(t)
        msg = ("<181>%s %s %s %010d 1 0 %s.%03d %s %010d %s NOTICE %s: %s, ConfigVersionId=88, "
               "Device IP Address=%s, NetworkDeviceName=%s, User-Name=%s, Calling-Station-ID=%s, "
               "EndPointMACAddress=%s, EndPointMatchedProfile=%s, IdentityGroup=%s, AuthenticationMethod=%s, "
               "SelectedAuthorizationProfiles=%s, Location=Location#All Locations#SAKH#Haus %s, %s") % (
            stamp.strftime("%b %d %H:%M:%S"), server, cat, r.randint(0, 9999999999),
            stamp.strftime("%Y-%m-%d %H:%M:%S"), int((t % 1) * 1000), stamp.strftime("%z")[:3] + ":" + stamp.strftime("%z")[3:],
            r.randint(0, 9999999999), code, "Passed-Authentication" if not fail else "Failed-Attempt", text,
            nad["ip"], nad["name"], mac, mac, mac, prof, grp, "mab" if grp != "Domain_Computers" else "dot1x",
            authz if not fail else "DenyAccess", nad["building"],
            "FailureReason=5411 Supplicant stopped responding to ISE" if fail else "AuthenticationStatus=AuthenticationPassed")
        out.append(ev(t, "cisco:ise:syslog", "udp:20514", server, msg))
    return out


# ------------------------------------------------------------------- ThousandEyes
TE_TESTS = [("ELGA Portal", "https://portal.elga.gv.at", 18), ("e-card GIN (ECS)", "https://gin.ecard.sozialversicherung.at", 22),
            ("Microsoft 365", "https://outlook.office365.com", 12), ("Patientenportal", "https://portal.sakh.demo", 6),
            ("Telemedizin (Webex)", "https://sakh.webex.com", 14), ("Blutspendedienst Bestellportal", "https://bestellung.blutspende.demo", 25)]
TE_AGENTS = [("SAKH-RZ1", "A"), ("SAKH-Haus-C", "C"), ("SAKH-Haus-B", "B")]


def thousandeyes(ctx, ts):
    """sakh:thousandeyes:test - synthetic HTTP tests from enterprise agents (5 min)."""
    m = ctx.m
    out = []
    for agent, bld in TE_AGENTS:
        for name, url, base in TE_TESTS:
            r = rng(ctx.seed, "te", agent, name, int(ts))
            if bld == "C" and m.building_c_down(ts):
                data = {"loss_pct": 100.0, "latency_ms": None, "jitter_ms": None, "http_status": 0,
                        "availability_pct": 0.0, "response_ms": None, "error": "Agent offline"}
            else:
                lat = base * (1 + 0.15 * noise(ctx.seed, "te-" + agent + name, ts, 1800)) + r.random() * 2
                loss = 0.0 if r.random() > 0.03 else round(r.random() * 2, 2)
                if bld == "C" and m.lead("network_building_c", ts) > 0.3:
                    loss += 4 * m.lead("network_building_c", ts)
                    lat *= 1.6
                data = {"loss_pct": round(loss, 2), "latency_ms": round(lat, 1), "jitter_ms": round(r.random() * 2.5, 2),
                        "http_status": 200, "availability_pct": 100.0 if loss < 50 else 0.0,
                        "response_ms": int(lat * 6 + r.gauss(120, 30)), "error": None}
            data.update({"test_name": name, "url": url, "agent": agent, "building": bld, "test_type": "http-server"})
            out.append(ev(ts, "sakh:thousandeyes:test", "thousandeyes:tests", "api.thousandeyes.com", data))
    return out


# ------------------------------------------------------------------- medical devices
def _interval_for(dev):
    return {"MRT": 120, "CT": 120, "ANES": 120, "LAB": 120, "VENT": 300, "MON": 300, "PUMP": 900,
            "US": 600, "ROE": 600, "ANGIO": 300}[dev["device_type"]]


def medtech(ctx, ts):
    """sakh:medtech:telemetry - IoT telemetry of imaging, ICU and laboratory devices via the device gateway."""
    m = ctx.m
    out = []
    h = ctx.clock.hour(ts)
    wd = ctx.clock.weekday(ts)
    work = office(h, wd)
    for d in H.DEVICES:
        if int(ts) % _interval_for(d) != 0:
            continue
        did, kind = d["device_id"], d["device_type"]
        r = rng(ctx.seed, "mt", did, int(ts))
        base = {"device_id": did, "device_type": kind, "device_class": d["device_class"],
                "manufacturer": d["manufacturer"], "model": d["model"], "serial": d["serial"],
                "building": d["building"], "ward": d["ward"], "department": d["department"]}
        if d["building"] == "C" and m.building_c_down(ts) and kind not in ("MRT", "CT", "ROE", "ANGIO", "LAB"):
            base.update({"status": "Offline", "connectivity": "offline",
                         "last_seen_s": max(0, int(ctx.scen.elapsed("network_building_c", ts) - 420))})
            out.append(ev(ts, "sakh:medtech:telemetry", "medtech:gateway", "sakh-mtgw01", base))
            continue
        maint = unit(ctx.seed, "maint", did, int(ts // 86400)) < 0.01
        status = "Wartung" if maint else "in Betrieb"
        alarms = []
        if kind == "MRT":
            sc = ctx.scen
            lead = m.lead("mri_cooling", ts) if did == "MRT-1" else 0
            imp = m.impact("mri_cooling", ts) if did == "MRT-1" else 0
            e = sc.elapsed("mri_cooling", ts) if did == "MRT-1" else None
            he = m.helium(did, ts)
            shield = 42 + 1.5 * noise(ctx.seed, "shield" + did, ts, 3600) + 18 * lead + 30 * imp
            magnet = 4.2 + (0.0 if e is None or e < 360 else min(0.35, (e - 360) / 6000))
            data = {"helium_level_pct": he, "magnet_temp_k": round(magnet, 3), "shield_temp_k": round(shield, 1),
                    "helium_pressure_psi": round(1.2 + 0.05 * r.random() + 1.4 * imp, 2),
                    "cold_head_status": "FAULT" if imp > 0 else "WARNING" if lead > 0.4 else "OK",
                    "compressor_status": "FAULT" if imp > 0 else "OK",
                    "compressor_water_temp_c": round(18 + 1.5 * r.random() + 12 * lead, 1),
                    "exam_room_temp_c": round(21 + r.random(), 1),
                    "exams_today": int(18 * work * (h - 7) / 9) if 7 < h < 20 and imp == 0 else 0,
                    "quench_risk": "hoch" if he < 75 else "mittel" if imp > 0 else "niedrig"}
            if imp > 0:
                status = "Gesperrt"
                alarms = ["COLD_HEAD_FAULT", "COMPRESSOR_FAULT", "HELIUM_BOILOFF"]
            elif lead > 0.4:
                alarms = ["SHIELD_TEMP_HIGH"]
        elif kind == "CT":
            data = {"tube_heat_pct": round(clamp(20 + 55 * work * r.random(), 0, 100), 1), "gantry_rpm": 240 if work > 0.3 else 0,
                    "detector_temp_c": round(28 + 2 * r.random(), 1), "scans_today": int(60 * work * max(0, h - 7) / 9),
                    "dose_alert": r.random() < 0.002}
        elif kind in ("ROE", "ANGIO", "US"):
            data = {"exams_today": int((30 if kind == "ROE" else 8) * work * max(0, h - 7) / 9),
                    "tube_heat_pct": round(15 + 40 * work * r.random(), 1) if kind != "US" else None,
                    "probe_temp_c": round(30 + 4 * r.random(), 1) if kind == "US" else None}
            status = status if work > 0.2 else "Standby"
        elif kind == "VENT":
            occ = unit(ctx.seed, "ventuse", did, int(ts // 43200)) < (0.55 if d["department"] == "ICU" else 0.1)
            data = {"mode": r.choice(["PC-AC", "PC-SIMV", "CPAP/PS"]) if occ else None,
                    "peep_cmh2o": round(5 + 5 * unit(ctx.seed, "peep", did), 1) if occ else None,
                    "fio2_pct": int(30 + 40 * unit(ctx.seed, "fio2", did, int(ts // 3600))) if occ else None,
                    "tidal_volume_ml": int(420 + 80 * r.random()) if occ else None,
                    "resp_rate": int(14 + 6 * r.random()) if occ else None,
                    "battery_pct": 100, "in_use": occ}
            status = "in Betrieb" if occ else "Standby"
            if occ and r.random() < 0.01:
                alarms = [r.choice(["HIGH_PRESSURE", "LOW_MINUTE_VOLUME", "DISCONNECT"])]
        elif kind == "MON":
            data = {"connected_patient": unit(ctx.seed, "monuse", did, int(ts // 21600)) < 0.8,
                    "battery_pct": 100, "alarms_last_5m": int(r.random() * 3)}
            if data["alarms_last_5m"] >= 2:
                alarms = ["SPO2_LOW" if r.random() < 0.5 else "HR_HIGH"]
        elif kind == "PUMP":
            active = r.random() < 0.55
            data = {"infusing": active, "rate_ml_h": round(r.uniform(2, 125), 1) if active else 0.0,
                    "battery_pct": int(40 + 60 * unit(ctx.seed, "batt", did, int(ts // 7200))),
                    "drug_library": "SAKH-DL-2026.3" if unit(ctx.seed, "dl", did) > 0.12 else "SAKH-DL-2025.4",
                    "firmware": "B. Braun 689F" if d["manufacturer"] == "B. Braun" else "4.2"}
            status = "infundiert" if active else "Standby"
            if active and r.random() < 0.015:
                alarms = ["OCCLUSION"]
        elif kind == "ANES":
            room = did.replace("ANES-", "")
            data = {"o2_supply_bar": round(4.8 + 0.2 * r.random(), 2), "sevoflurane_level_pct": int(40 + 50 * unit(ctx.seed, "sevo", did, int(ts // 14400))),
                    "self_test": "bestanden", "room": room}
            status = "in Betrieb" if 7.5 < h < 16 and wd < 5 else "Standby"
        else:
            data = {"samples_per_hour": int(40 + 360 * work * r.random()) if "BGA" not in did else int(5 + 10 * r.random()),
                    "qc_status": "bestanden" if r.random() > 0.01 else "fehlgeschlagen",
                    "reagent_level_pct": int(15 + 80 * unit(ctx.seed, "reag", did, int(ts // 21600)))}
            if data["qc_status"] != "bestanden":
                alarms = ["QC_FAILED"]
        base.update(data)
        base.update({"status": status, "connectivity": "online", "network": d["network"],
                     "alarms": alarms, "alarm_count": len(alarms)})
        out.append(ev(ts, "sakh:medtech:telemetry", "medtech:gateway", "sakh-mtgw01", base))
    return out


# ------------------------------------------------------------------- Windows
WIN_EVENTS = [
    ("Security", 4624, "Logon", "Audit Success", "An account was successfully logged on.", 0.55),
    ("Security", 4634, "Logoff", "Audit Success", "An account was logged off.", 0.25),
    ("Security", 4625, "Logon", "Audit Failure", "An account failed to log on.", 0.05),
    ("Security", 4672, "Special Logon", "Audit Success", "Special privileges assigned to new logon.", 0.08),
    ("Security", 4740, "User Account Management", "Audit Success", "A user account was locked out.", 0.005),
    ("System", 7036, "None", "Classic", "The Windows Update service entered the running state.", 0.05),
    ("System", 1014, "None", "Classic", "Name resolution for the name wpad timed out after none of the configured DNS servers responded.", 0.015),
]


def _win(ctx, t, host, log, code, task, kw, msg, extra, r, etype="Information"):
    lt = ctx.clock.local(t)
    lines = [lt.strftime("%m/%d/%Y %I:%M:%S %p"), "LogName=%s" % log, "EventCode=%d" % code,
             "EventType=%d" % (0 if kw.startswith("Audit") else 4), "ComputerName=%s.%s" % (host, DOMAIN),
             "SourceName=%s" % ("Microsoft Windows security auditing." if log == "Security" else
                                "Service Control Manager" if code == 7036 else extra.pop("_source", "Microsoft-Windows-DNS-Client")),
             "Type=%s" % etype, "RecordNumber=%d" % r.randint(10 ** 6, 10 ** 8),
             "Keywords=%s" % kw, "TaskCategory=%s" % task, "OpCode=Info", "Message=%s" % msg]
    for k, v in extra.items():
        lines.append("%s:\t%s" % (k, v))
    return ev(t, "WinEventLog", "WinEventLog:%s" % log, host, "\n".join(lines))


def windows_events(ctx, ts):
    """WinEventLog - Security, System and Application events of the Windows servers."""
    m = ctx.m
    r = rng(ctx.seed, "win", int(ts))
    out = []
    lam = 4 + 8 * office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
    for _ in range(poisson(r, lam)):
        host = weighted(r, [(h, 6 if "cvda" in h or "dc0" in h else 1) for h in H.WINDOWS])
        log, code, task, kw, msg, _ = weighted(r, [(e, e[5]) for e in WIN_EVENTS])
        extra = {}
        if log == "Security":
            extra = {"Account Name": "u%05d" % r.randint(0, 2400) if r.random() < 0.8 else "svc_kis",
                     "Account Domain": "SAKH", "Logon Type": r.choice([2, 3, 10]),
                     "Source Network Address": "10.%d.%d.%d" % (r.choice([30, 40, 50, 60]), r.randint(3, 6), r.randint(2, 250))}
            if code == 4625:
                extra["Failure Reason"] = "Unknown user name or bad password."
        out.append(_win(ctx, ts - r.random() * 60, host, log, code, task, kw, msg, extra, r,
                        "Information" if code != 4625 else "Information"))
    if m.impact("kis_db", ts) > 0.3 and r.random() < 0.8:
        host = "sakh-kisapp0%d" % r.randint(1, 4)
        out.append(_win(ctx, ts - r.random() * 30, host, "Application", 3001, "None", "Classic",
                        "KIS.Server: Zeitueberschreitung beim Datenbankzugriff (ORA-12170 / Sperrwartezeit > 30s) - Modul ADT",
                        {"_source": "KIS.Server"}, r, "Error"))
    if m.impact("hl7_queue", ts) > 0.3 and r.random() < 0.3:
        out.append(_win(ctx, ts - r.random() * 30, "sakh-lisapp01", "Application", 2104, "None", "Classic",
                        "LIS.Interface: Keine Quittung (ACK) vom Kommunikationsserver fuer ORU^R01 - Nachricht wird erneut gesendet",
                        {"_source": "LIS.Interface"}, r, "Warning"))
    return out


def windows_perf(ctx, ts):
    """sakh:windows:perf - performance counters of the Windows servers (2 min)."""
    m = ctx.m
    out = []
    work = office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
    for host in H.WINDOWS:
        s = H.SERVER[host]
        r = rng(ctx.seed, "wperf", host, int(ts))
        cpu = 8 + 35 * work * (1.3 if "cvda" in host or "kisapp" in host else 0.6) + 5 * noise(ctx.seed, "wc" + host, ts, 600)
        if "kisapp" in host:
            cpu += 30 * m.impact("kis_db", ts)
        if host == "sakh-sql01":
            cpu += 15 * work
        mem = 45 + 25 * unit(ctx.seed, "wm", host) + 8 * work
        cfree = 35 + 30 * unit(ctx.seed, "cfree", host) - 2 * noise(ctx.seed, "cf" + host, ts, 86400)
        out.append(ev(ts, "sakh:windows:perf", "perfmon", host, {
            "host": host, "os": s["os"], "role": s["role"], "application": s["application"],
            "cpu_pct": round(clamp(cpu, 1, 100), 1), "mem_pct": round(clamp(mem, 5, 99), 1),
            "disk_c_free_pct": round(cfree, 1), "disk_d_free_pct": round(20 + 50 * unit(ctx.seed, "dfree", host), 1),
            "disk_queue": round(0.2 + 2 * work * r.random(), 2), "net_mbps": round(5 + 120 * work * r.random(), 1),
            "sessions": int(18 + 45 * work) if "cvda" in host else None,
            "kis_service": ("Running" if "kisapp" in host else None)}))
    return out


# ------------------------------------------------------------------- Linux
def linux_syslog(ctx, ts):
    """syslog - Linux system logs (RHEL / Ubuntu)."""
    m = ctx.m
    r = rng(ctx.seed, "lsys", int(ts))
    out = []

    def line(t, host, proc, msg):
        out.append(ev(t, "syslog", "/var/log/messages", host, "%s %s %s: %s" % (
            ctx.clock.syslog(t), host, proc, msg)))

    for _ in range(poisson(r, 2.0)):
        host = r.choice(H.LINUX)
        pid = r.randint(1000, 60000)
        tmpl = r.choice([
            ("sshd[%d]" % pid, "Accepted publickey for ansible from 10.10.5.30 port %d ssh2: ED25519 SHA256:redacted" % r.randint(30000, 60000)),
            ("systemd[1]", "Started Session %d of User ansible." % r.randint(100, 9999)),
            ("CROND[%d]" % pid, "(root) CMD (/usr/lib64/sa/sa1 1 1)"),
            ("chronyd[812]", "Selected source 10.10.0.5 (ntp.sakh.local)"),
            ("auditd[701]", "Audit daemon rotating log files"),
            ("sudo[%d]" % pid, "ansible : TTY=pts/0 ; PWD=/home/ansible ; USER=root ; COMMAND=/usr/bin/dnf check-update"),
        ])
        line(ts - r.random() * 60, host, tmpl[0], tmpl[1])
    if r.random() < 0.02:
        line(ts - r.random() * 60, r.choice(H.LINUX), "sshd[%d]" % r.randint(1000, 60000),
             "Failed password for invalid user admin from 10.%d.3.%d port %d ssh2" % (
                 r.choice([30, 40]), r.randint(2, 250), r.randint(30000, 60000)))
    if m.lead("hl7_queue", ts) > 0.5 and r.random() < 0.4:
        line(ts, "sakh-kom01", "kernel", "EXT4-fs warning (device dm-3): ext4_dx_add_entry: Directory index full!")
    if m.impact("hl7_queue", ts) > 0:
        line(ts - r.random() * 60, "sakh-kom01", "iris[4411]",
             "ERROR #5005: Cannot open file '/data/iris/mgr/journal/20261120.004': No space left on device")
        if r.random() < 0.5:
            line(ts - r.random() * 60, "sakh-kom01", "iris[4411]",
                 "HL7 production SAKH.KOM: Operation LIS_KIS_ORU suspended - queue size %d" % m.hl7_backlog("LIS_KIS_ORU", ts))
    if m.impact("kis_db", ts) > 0 and r.random() < 0.5:
        line(ts - r.random() * 60, "sakh-kisdb01", "oracle[2210]",
             "KISPRD: ORA-00060: deadlock detected while waiting for resource (session LKF_EXPORT vs. ADT_SERVICE)")
    return out


def linux_perf(ctx, ts):
    """sakh:linux:perf - CPU, memory and filesystem metrics of the Linux servers (2 min)."""
    m = ctx.m
    out = []
    work = office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
    for host in H.LINUX:
        s = H.SERVER[host]
        r = rng(ctx.seed, "lperf", host, int(ts))
        cpu = 6 + 30 * work * (1.4 if "kisdb" in host else 0.7) + 4 * noise(ctx.seed, "lc" + host, ts, 600)
        iowait = 1 + 3 * r.random()
        if host == "sakh-kisdb01":
            cpu += 45 * m.impact("kis_db", ts) + 15 * m.lead("kis_db", ts)
            iowait += 25 * m.impact("kis_db", ts)
        if host == "sakh-veeam01":
            cpu += 40 * bump(ctx.clock.hour(ts), 2.5, 1.2)
        data_fs = 55 + 20 * unit(ctx.seed, "ldata", host)
        if host == "sakh-kom01":
            data_fs = m.kom_fs_used(ts)
        out.append(ev(ts, "sakh:linux:perf", "linux:metrics", host, {
            "host": host, "os": s["os"], "role": s["role"], "application": s["application"],
            "cpu_pct": round(clamp(cpu, 1, 100), 1), "iowait_pct": round(clamp(iowait, 0, 90), 1),
            "mem_pct": round(50 + 30 * unit(ctx.seed, "lm", host) + 5 * work, 1),
            "load1": round((cpu / 100) * s["cores"] * (0.8 + 0.4 * r.random()), 2),
            "fs_root_used_pct": round(40 + 20 * unit(ctx.seed, "lroot", host), 1),
            "fs_var_used_pct": round(30 + 30 * unit(ctx.seed, "lvar", host), 1),
            "fs_data_used_pct": round(data_fs, 1), "swap_used_pct": round(2 + 5 * r.random(), 1)}))
    return out


# ------------------------------------------------------------------- databases
def databases(ctx, ts):
    """sakh:db:performance - database KPIs (Oracle, MS SQL, PostgreSQL, InterSystems IRIS) every minute."""
    m = ctx.m
    out = []
    h = ctx.clock.hour(ts)
    work = office(h, ctx.clock.weekday(ts))
    kis_imp, kis_lead = m.impact("kis_db", ts), m.lead("kis_db", ts)
    for inst, engine, ver, host, app, size in H.DATABASES:
        r = rng(ctx.seed, "db", inst, int(ts))
        sess = 20 + (300 if inst == "KISPRD" else 60) * work + 5 * r.random()
        q = (4 if engine != "InterSystems IRIS" else 2) * (1 + 0.6 * work) * (1 + 0.2 * noise(ctx.seed, "dbq" + inst, ts, 900))
        tps = (1200 if inst == "KISPRD" else 200) * (0.3 + work) * (0.9 + 0.2 * r.random())
        blocked = 0
        wait = "CPU"
        lag = None
        status = "ok"
        if inst == "KISPRD":
            blocked = int(40 * kis_imp + 4 * kis_lead * r.random())
            q *= 1 + 2 * kis_lead + 30 * kis_imp
            sess += 250 * kis_imp
            tps *= 1 - 0.6 * kis_imp
            if kis_imp > 0 or kis_lead > 0.5:
                wait = "enq: TX - row lock contention"
            status = "kritisch" if kis_imp > 0.5 else "warnung" if kis_lead > 0.5 else "ok"
        if inst == "KISSTBY":
            lag = round(2 + 3 * r.random() + 90 * kis_imp, 1)
            sess, tps = 4, 0
        if inst in ("LISDB", "PACSDB", "RISDB", "OPDB", "BBANKDB", "APODB"):
            lag = round(0.2 + 0.6 * r.random(), 2)
            wait = "PAGEIOLATCH_SH" if r.random() < 0.3 else "CXPACKET"
        if inst == "KOMIRIS":
            jfs = m.kom_fs_used(ts)
            wait = "Journal I/O" if jfs > 95 else "CPU"
            status = "kritisch" if jfs > 99 else "warnung" if jfs > 90 else "ok"
            tps *= 1 - 0.9 * m.impact("hl7_queue", ts)
        out.append(ev(ts, "sakh:db:performance", "db:metrics", host, {
            "instance": inst, "engine": engine, "version": ver, "host": host, "application": app,
            "active_sessions": int(sess), "avg_query_ms": round(q, 1), "tps": int(tps),
            "blocked_sessions": blocked, "top_wait_event": wait,
            "cpu_pct": round(clamp(10 + 45 * work + 40 * (kis_imp if inst == "KISPRD" else 0) + 5 * r.random(), 1, 100), 1),
            "buffer_hit_pct": round(99.2 - 0.6 * r.random() - (8 * kis_imp if inst == "KISPRD" else 0), 2),
            "size_gb": size, "tablespace_used_pct": round(62 + 25 * unit(ctx.seed, "ts", inst), 1),
            "replication_lag_s": lag, "status": status}))
    return out


# ------------------------------------------------------------------- VMware
def vmware(ctx, ts):
    """sakh:vmware:perf - ESXi host and datastore metrics (5 min)."""
    m = ctx.m
    out = []
    work = office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
    for host, cluster in H.ESX_HOSTS:
        r = rng(ctx.seed, "esx", host, int(ts))
        vms = [s for s in H.SERVER.values() if s["cluster"] == cluster]
        share = len(vms) / (5 if cluster == "RZ1-Klinik" else 3)
        out.append(ev(ts, "sakh:vmware:perf", "vcenter:sakh-vc01", "sakh-vc01", {
            "esx_host": host, "cluster": cluster, "vm_count": int(share + r.randint(0, 3)),
            "cpu_pct": round(clamp(18 + 40 * work + 6 * r.random() + (10 * m.impact("kis_db", ts) if cluster == "RZ1-Klinik" else 0), 1, 100), 1),
            "mem_pct": round(55 + 20 * unit(ctx.seed, "esxm", host) + 5 * work, 1),
            "datastore": "DS-%s-%02d" % (cluster.split("-")[0], 1 + (int(host[-2:]) % 3)),
            "datastore_latency_ms": round(1.2 + 2 * r.random() + (12 * m.impact("hl7_queue", ts) if host == "sakh-esx02" else 0), 2),
            "datastore_used_pct": round(60 + 25 * unit(ctx.seed, "dsu", host), 1),
            "ha_status": "green", "connection_state": "connected"}))
    return out


# ------------------------------------------------------------------- backup
def backup(ctx, ts):
    """sakh:backup - nightly Veeam / RMAN backup jobs and repository capacity."""
    out = []
    lt = ctx.clock.local(ts)
    midnight = ts - ctx.clock.hour(ts) * 3600
    day = lt.strftime("%Y-%m-%d")
    for i, host in enumerate(sorted(H.SERVER)):
        r = rng(ctx.seed, "bkp", host, day)
        start = midnight + (0.75 + (i % 12) * 0.25) * 3600
        dur = 600 + r.random() * 3600 * (3 if host in ("sakh-pacs01", "sakh-kisdb01") else 1)
        end = start + dur
        if ts - 60 < end <= ts:
            status = weighted(r, [("Success", 0.93), ("Warning", 0.05), ("Failed", 0.02)])
            out.append(ev(end, "sakh:backup", "veeam:jobs", "sakh-veeam01", {
                "job": "RMAN-KISPRD" if host == "sakh-kisdb01" else "VBR-%s" % host, "host": host,
                "application": H.SERVER[host]["application"], "type": "RMAN Level 1" if host == "sakh-kisdb01" else "Incremental",
                "status": status, "start": int(start), "end": int(end), "duration_s": int(dur),
                "size_gb": round(5 + r.random() * (900 if host == "sakh-pacs01" else 80), 1),
                "message": "" if status == "Success" else "Snapshot-Erstellung dauerte zu lange" if status == "Warning"
                else "Verbindung zum Gast unterbrochen"}))
    if int(ts) % 3600 == 0:
        out.append(ev(ts, "sakh:backup", "veeam:repository", "sakh-veeam01", {
            "type": "repository", "repository": "SAKH-Hardened-Repo", "capacity_tb": 480,
            "used_pct": round(68 + 4 * noise(ctx.seed, "repo", ts, 86400 * 3), 1), "immutable_days": 30}))
        out.append(ev(ts, "sakh:backup", "pacs:archiv", "sakh-pacs01", {
            "type": "repository", "repository": "PACS-Langzeitarchiv", "capacity_tb": 1200,
            "used_pct": round(74 + 2 * noise(ctx.seed, "pacsarch", ts, 86400 * 5), 1), "immutable_days": 3650}))
    return out


# ------------------------------------------------------------------- HL7 engine
def hl7_engine(ctx, ts):
    """sakh:hl7:engine - communication server channel KPIs every minute."""
    m = ctx.m
    out = []
    work = office(ctx.clock.hour(ts), ctx.clock.weekday(ts))
    for ch, src, dst, mtype, peak, direction in H.HL7_CHANNELS:
        r = rng(ctx.seed, "hl7", ch, int(ts))
        msgs = poisson(r, peak * (0.2 + 0.8 * work) * (1 + 0.5 * m.flu(ts)))
        backlog = m.hl7_backlog(ch, ts)
        q = backlog + r.randint(0, 3)
        stuck = backlog > 0 and m.impact("hl7_queue", ts) > 0
        lat = (180 + 120 * r.random()) * (1 + q / 20)
        if ch == "KIS_LKF_BAR":
            lat += 2000 * m.impact("kis_db", ts)
        out.append(ev(ts, "sakh:hl7:engine", "kom:channels", "sakh-kom01", {
            "channel": ch, "source_system": src, "target_system": dst, "message_type": mtype, "direction": direction,
            "messages_in": msgs, "messages_out": 0 if stuck else msgs, "queue_depth": q,
            "avg_latency_ms": int(lat), "ack_errors": (msgs if stuck else (1 if r.random() < 0.02 else 0)),
            "status": "gestoppt" if stuck and q > 200 else "Stau" if q > 50 else "ok",
            "engine": "InterSystems HealthShare Health Connect", "node": "sakh-kom01"}))
    return out


GENERATORS = [
    ("dnac_health", 300, dnac_health),
    ("dnac_issue", 60, dnac_issue),
    ("ios", 60, ios_syslog),
    ("cisco_iq", 900, cisco_iq),
    ("ise", 60, ise),
    ("thousandeyes", 300, thousandeyes),
    ("medtech", 60, medtech),
    ("win_events", 60, windows_events),
    ("win_perf", 120, windows_perf),
    ("linux_syslog", 60, linux_syslog),
    ("linux_perf", 120, linux_perf),
    ("db", 60, databases),
    ("vmware", 300, vmware),
    ("backup", 60, backup),
    ("hl7", 60, hl7_engine),
]
