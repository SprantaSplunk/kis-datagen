"""Static model of the Splunk Allgemeines Krankenhaus (SAKH), Vienna.

All names, IDs and serial numbers are synthetic.
"""

from .util import rng

HOSPITAL = "Splunk Allgemeines Krankenhaus"
HOSPITAL_SHORT = "SAKH"
CITY = "Wien"

BUILDINGS = [
    {"code": "A", "name": "Haus A - Innere Medizin", "floors": 6},
    {"code": "B", "name": "Haus B - Chirurgisches Zentrum", "floors": 5},
    {"code": "C", "name": "Haus C - Akut- und Intensivzentrum", "floors": 4},
    {"code": "D", "name": "Haus D - Frauen, Kind und Psyche", "floors": 5},
]
BUILDING_NAME = {b["code"]: b["name"] for b in BUILDINGS}

# code, name, beds, building, base occupancy, average length of stay (days), surgical
DEPARTMENTS = [
    ("INN", "Innere Medizin", 140, "A", 0.92, 6.5, False),
    ("KAR", "Kardiologie", 60, "A", 0.89, 4.5, False),
    ("NEU", "Neurologie", 50, "A", 0.87, 7.0, False),
    ("ONK", "Onkologie", 60, "A", 0.86, 6.0, False),
    ("CHI", "Allgemein- und Viszeralchirurgie", 90, "B", 0.84, 5.5, True),
    ("UCH", "Unfallchirurgie und Orthopaedie", 70, "B", 0.86, 6.0, True),
    ("URO", "Urologie", 40, "B", 0.80, 4.0, True),
    ("HNO", "HNO", 30, "B", 0.76, 3.5, True),
    ("ANA", "Anaesthesie und OP (Aufwachraum)", 16, "B", 0.45, 0.3, True),
    ("ICU", "Intensivmedizin", 40, "C", 0.88, 5.0, False),
    ("ZNA", "Zentrale Notaufnahme", 24, "C", 0.70, 0.4, False),
    ("RAD", "Radiologie", 0, "C", 0.0, 0.0, False),
    ("GYN", "Gynaekologie und Geburtshilfe", 60, "D", 0.76, 3.5, True),
    ("PAED", "Kinder- und Jugendheilkunde", 50, "D", 0.72, 3.5, False),
    ("PSY", "Psychiatrie", 60, "D", 0.94, 18.0, False),
]
DEPT = {d[0]: {"code": d[0], "name": d[1], "beds": d[2], "building": d[3], "occ": d[4],
               "los": d[5], "surgical": d[6]} for d in DEPARTMENTS}
BED_DEPTS = [d[0] for d in DEPARTMENTS if d[2] > 0]
FLU_DEPTS = {"INN": 1.0, "PAED": 1.0, "ICU": 0.9, "NEU": 0.35, "KAR": 0.45, "ZNA": 1.0, "ONK": 0.3}


def _wards():
    wards = []
    floor_next = {b["code"]: 1 for b in BUILDINGS}
    for code, name, beds, bld, _occ, _los, _surg in DEPARTMENTS:
        if beds <= 0:
            continue
        n = max(1, -(-beds // 30))
        per = [beds // n + (1 if i < beds % n else 0) for i in range(n)]
        for i, b in enumerate(per, 1):
            floor = floor_next[bld]
            floor_next[bld] = floor + 1 if floor_next[bld] < 5 else 1
            wid = code if n == 1 else "%s-%d" % (code, i)
            wname = name if n == 1 else "%s %d" % (name, i)
            wards.append({"ward": wid, "ward_name": wname, "department": code, "department_name": name,
                          "building": bld, "building_name": BUILDING_NAME[bld], "floor": floor, "beds": b})
    return wards


WARDS = _wards()
WARD = {w["ward"]: w for w in WARDS}
TOTAL_BEDS = sum(w["beds"] for w in WARDS)

OR_ROOMS = [{"room": "OP-%d" % i, "building": "B", "suite": "Zentral-OP"} for i in range(1, 11)] + [
    {"room": "OP-D1", "building": "D", "suite": "Kreisssaal-OP"},
    {"room": "OP-D2", "building": "D", "suite": "Kreisssaal-OP"},
]

# procedure, department, minutes, OPS-like code, needs blood (EK units)
PROCEDURES = [
    ("Laparoskopische Cholezystektomie", "CHI", 75, "5-511.11", 0),
    ("Hemikolektomie rechts", "CHI", 160, "5-455.41", 2),
    ("Leistenhernien-OP (TEP)", "CHI", 60, "5-530.31", 0),
    ("Appendektomie laparoskopisch", "CHI", 50, "5-470.11", 0),
    ("Hueft-TEP", "UCH", 110, "5-820.00", 2),
    ("Knie-TEP", "UCH", 105, "5-822.g1", 1),
    ("Osteosynthese proximaler Femur", "UCH", 90, "5-790.6f", 2),
    ("Arthroskopie Knie", "UCH", 45, "5-812.5", 0),
    ("TUR-Prostata", "URO", 70, "5-601.1", 0),
    ("Radikale Prostatektomie", "URO", 200, "5-604.42", 2),
    ("Tonsillektomie", "HNO", 45, "5-281.0", 0),
    ("Septumplastik", "HNO", 60, "5-214.6", 0),
    ("Sectio caesarea", "GYN", 50, "5-749.11", 1),
    ("Hysterektomie laparoskopisch", "GYN", 120, "5-683.01", 1),
    ("Mammachirurgie (BET)", "GYN", 90, "5-870.a2", 0),
]

TRIAGE = [(1, "rot", "sofort", 0), (2, "orange", "sehr dringend", 10), (3, "gelb", "dringend", 30),
          (4, "gruen", "normal", 90), (5, "blau", "nicht dringend", 120)]
ED_COMPLAINTS = [
    ("Brustschmerz", "KAR"), ("Atemnot", "INN"), ("Bauchschmerzen", "CHI"), ("Sturz / Trauma", "UCH"),
    ("Fieber", "INN"), ("Neurologisches Defizit", "NEU"), ("Synkope", "KAR"), ("Kopfschmerz", "NEU"),
    ("Rueckenschmerz", "UCH"), ("Verletzung Extremitaet", "UCH"), ("Harnverhalt", "URO"),
    ("Psychische Krise", "PSY"), ("Fieber Kind", "PAED"), ("Schwangerschaftskomplikation", "GYN"),
    ("Epistaxis", "HNO"), ("Allgemeine Schwaeche", "INN"),
]

# code, name, unit, low, high, category, critical_low, critical_high
LAB_TESTS = [
    ("HB", "Haemoglobin", "g/dL", 12.0, 17.0, "Haematologie", 7.0, 20.0),
    ("LEUKO", "Leukozyten", "G/L", 4.0, 10.0, "Haematologie", 1.0, 30.0),
    ("THROMBO", "Thrombozyten", "G/L", 150, 400, "Haematologie", 30, 1000),
    ("NA", "Natrium", "mmol/L", 135, 145, "Klinische Chemie", 120, 160),
    ("K", "Kalium", "mmol/L", 3.5, 5.1, "Klinische Chemie", 2.8, 6.2),
    ("KREA", "Kreatinin", "mg/dL", 0.6, 1.2, "Klinische Chemie", 0.2, 5.0),
    ("CRP", "C-reaktives Protein", "mg/L", 0, 5, "Klinische Chemie", 0, 300),
    ("TROP", "Troponin T hs", "ng/L", 0, 14, "Kardiale Marker", 0, 100),
    ("LAKTAT", "Laktat", "mmol/L", 0.5, 2.2, "Blutgas", 0, 4.0),
    ("INR", "INR", "", 0.9, 1.2, "Gerinnung", 0, 4.5),
    ("GLU", "Glukose", "mg/dL", 70, 110, "Klinische Chemie", 40, 400),
    ("PCT", "Procalcitonin", "ng/mL", 0, 0.5, "Infektion", 0, 10),
    ("INFLU", "Influenza A/B PCR", "", 0, 0, "Mikrobiologie", 0, 0),
    ("SARS2", "SARS-CoV-2 PCR", "", 0, 0, "Mikrobiologie", 0, 0),
    ("BLUTKULT", "Blutkultur", "", 0, 0, "Mikrobiologie", 0, 0),
    ("ABO", "Blutgruppe / Antikoerpersuchtest", "", 0, 0, "Immunhaematologie", 0, 0),
    ("KREUZ", "Kreuzprobe", "", 0, 0, "Immunhaematologie", 0, 0),
]

BLOOD_GROUPS = ["0-", "0+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
BLOOD_SHARE = {"0-": 0.06, "0+": 0.30, "A-": 0.07, "A+": 0.37, "B-": 0.02, "B+": 0.12, "AB-": 0.01, "AB+": 0.05}
# product, label, shelf life days, target units at 100 % (scaled by blood group share)
BLOOD_PRODUCTS = [
    ("EK", "Erythrozytenkonzentrat", 42, 260),
    ("TK", "Thrombozytenkonzentrat", 5, 36),
    ("FFP", "Gefrorenes Frischplasma", 730, 180),
]

IMAGING_MODALITIES = [
    ("CT", "Computertomographie", 0.38), ("MR", "Magnetresonanztomographie", 0.16),
    ("CR", "Roentgen", 0.32), ("US", "Ultraschall", 0.10), ("XA", "Angiographie", 0.04),
]
EXAMS = {
    "CT": ["CT Schaedel nativ", "CT Thorax", "CT Abdomen mit KM", "CT-Angiographie", "CT Polytrauma"],
    "MR": ["MRT Schaedel", "MRT Wirbelsaeule", "MRT Knie", "MRT Abdomen", "MRT Prostata"],
    "CR": ["Roentgen Thorax", "Roentgen Becken", "Roentgen Sprunggelenk", "Roentgen Hand"],
    "US": ["Sonographie Abdomen", "Duplex Carotis", "Echokardiographie"],
    "XA": ["Koronarangiographie", "Periphere Angiographie"],
}

DRUGS = [
    ("J01CR02", "Amoxicillin/Clavulansaeure 2,2 g i.v.", 900, False),
    ("J01CR05", "Piperacillin/Tazobactam 4,5 g i.v.", 600, False),
    ("J01DD04", "Ceftriaxon 2 g i.v.", 700, False),
    ("C01CA03", "Noradrenalin 1 mg/ml", 300, True),
    ("N01AX10", "Propofol 1 %", 800, True),
    ("B01AB01", "Heparin 25.000 IE", 500, False),
    ("B01AB05", "Enoxaparin 40 mg", 2500, False),
    ("A10AB01", "Insulin human (Normalinsulin)", 400, False),
    ("N02BE01", "Paracetamol 1 g i.v.", 3000, False),
    ("N02AB03", "Fentanyl 0,1 mg", 400, True),
    ("J05AH02", "Oseltamivir 75 mg", 200, False),
    ("R03AC02", "Salbutamol Inhalation", 300, False),
    ("H02AB04", "Methylprednisolon 125 mg", 300, False),
    ("C03CA01", "Furosemid 20 mg i.v.", 900, False),
    ("N05BA01", "Diazepam 10 mg", 300, False),
    ("A02BC02", "Pantoprazol 40 mg", 2000, False),
    ("B05BB01", "NaCl 0,9 % 1000 ml", 6000, False),
    ("B05XA03", "Kaliumchlorid 7,45 %", 500, True),
]

USER_ROLES = [("Arzt", 0.30), ("Pflege", 0.45), ("Verwaltung", 0.12), ("MTD", 0.10), ("IT", 0.03)]

# ---------------------------------------------------------------- medical devices

_MODELS = {
    "MRT": [("Siemens Healthineers", "MAGNETOM Vida 3T"), ("Siemens Healthineers", "MAGNETOM Sola 1.5T"),
            ("Philips", "Ingenia Ambition 1.5T")],
    "CT": [("Siemens Healthineers", "SOMATOM Force"), ("GE HealthCare", "Revolution Apex"),
           ("Philips", "Spectral CT 7500")],
    "ROE": [("Siemens Healthineers", "Ysio X.pree"), ("Philips", "DigitalDiagnost C90"),
            ("Siemens Healthineers", "Mobilett Elara Max")],
    "ANGIO": [("Siemens Healthineers", "ARTIS icono"), ("Philips", "Azurion 7")],
    "US": [("GE HealthCare", "LOGIQ E10"), ("Philips", "EPIQ Elite"), ("Siemens Healthineers", "ACUSON Sequoia")],
    "PUMP": [("B. Braun", "Infusomat Space"), ("B. Braun", "Perfusor Space"), ("Fresenius Kabi", "Agilia VP")],
    "VENT": [("Draeger", "Evita V800"), ("Hamilton Medical", "HAMILTON-C6")],
    "MON": [("Philips", "IntelliVue MX750"), ("Mindray", "BeneVision N17")],
    "ANES": [("Draeger", "Atlan A350")],
    "LAB": [("Roche", "cobas pro"), ("Roche", "cobas t 711"), ("Sysmex", "XN-9100"),
            ("Bio-Rad", "IH-1000"), ("Radiometer", "ABL90 FLEX")],
}
DEVICE_CLASS = {"MRT": "Magnetresonanztomograph", "CT": "Computertomograph", "ROE": "Roentgen",
                "ANGIO": "Angiographie", "US": "Ultraschall", "PUMP": "Infusionspumpe",
                "VENT": "Beatmungsgeraet", "MON": "Patientenmonitor", "ANES": "Narkosegeraet",
                "LAB": "Laboranalysator"}


def _devices():
    devs = []

    def add(kind, did, building, ward, dept, idx, network="wired"):
        maker, model = _MODELS[kind][idx % len(_MODELS[kind])]
        r = rng("sn", did)
        devs.append({"device_id": did, "device_type": kind, "device_class": DEVICE_CLASS[kind],
                     "manufacturer": maker, "model": model, "building": building, "ward": ward,
                     "department": dept, "serial": "%s%07d" % (maker[:2].upper().replace(" ", "X"), r.randint(0, 9999999)),
                     "network": network, "mac": "00:1b:%02x:%02x:%02x:%02x" % tuple(r.randint(0, 255) for _ in range(4)),
                     "install_year": 2015 + r.randint(0, 9)})

    add("MRT", "MRT-1", "C", "RAD", "RAD", 0)
    add("MRT", "MRT-2", "C", "RAD", "RAD", 1)
    add("MRT", "MRT-3", "A", "RAD", "RAD", 2)
    add("CT", "CT-1", "C", "ZNA", "RAD", 0)
    add("CT", "CT-2", "C", "RAD", "RAD", 1)
    add("CT", "CT-3", "B", "RAD", "RAD", 2)
    for i in range(1, 6):
        add("ROE", "ROE-%d" % i, "ABCDC"[i - 1], "RAD", "RAD", i)
    add("ANGIO", "ANGIO-1", "C", "RAD", "RAD", 0)
    add("ANGIO", "ANGIO-2", "A", "KAR-1", "KAR", 1)
    for i in range(1, 13):
        w = WARDS[(i * 5) % len(WARDS)]
        add("US", "US-%02d" % i, w["building"], w["ward"], w["department"], i)
    n = 0
    for w in WARDS:
        per = {"ICU": 3.0, "ZNA": 1.0, "ANA": 1.0}.get(w["department"], 0.25)
        for _ in range(int(round(w["beds"] * per))):
            n += 1
            add("PUMP", "PUMP-%04d" % n, w["building"], w["ward"], w["department"], n, "wlan")
    n = 0
    for w in WARDS:
        cnt = {"ICU": w["beds"], "ZNA": 4, "ANA": 6}.get(w["department"], 0)
        for _ in range(cnt):
            n += 1
            add("VENT", "VENT-%03d" % n, w["building"], w["ward"], w["department"], n)
    n = 0
    for w in WARDS:
        cnt = {"ICU": w["beds"], "ZNA": w["beds"], "ANA": w["beds"]}.get(w["department"], 0)
        if w["ward"] == "KAR-1":
            cnt = 12
        for _ in range(cnt):
            n += 1
            add("MON", "MON-%03d" % n, w["building"], w["ward"], w["department"], n)
    for room in OR_ROOMS:
        add("ANES", "ANES-%s" % room["room"], room["building"], "ANA", "ANA", 0)
    for i, name in enumerate(["LAB-CHEM-1", "LAB-CHEM-2", "LAB-COAG-1", "LAB-HAEM-1", "LAB-IH-1"]):
        add("LAB", name, "C", "LAB", "LAB", [0, 0, 1, 2, 3][i])
    for i, w in enumerate(["ICU-1", "ICU-2", "ZNA"]):
        add("LAB", "LAB-BGA-%d" % (i + 1), WARD[w]["building"], w, WARD[w]["department"], 4)
    return devs


DEVICES = _devices()
DEVICE = {d["device_id"]: d for d in DEVICES}

# ---------------------------------------------------------------- Cisco network


def _network():
    nd = []

    def add(name, family, model, role, location, building, ip, sw="17.9.5", series=None, managed=True):
        r = rng("net", name)
        nd.append({"name": name, "family": family, "model": model, "role": role, "location": location,
                   "building": building, "ip": ip, "software": sw, "series": series or model.split("-")[0],
                   "serial": "FOC%04d%04X" % (2300 + r.randint(0, 600), r.randint(0, 65535)),
                   "managed": managed})

    loc_rz1 = "Global/Wien/SAKH/Haus C/UG - Rechenzentrum 1"
    loc_rz2 = "Global/Wien/SAKH/Haus A/UG - Rechenzentrum 2"
    add("sakh-rz1-core01", "Switches and Hubs", "C9500-48Y4C", "CORE", loc_rz1, "C", "10.10.0.1", "17.12.4")
    add("sakh-rz1-core02", "Switches and Hubs", "C9500-48Y4C", "CORE", loc_rz2, "A", "10.10.0.2", "17.12.4")
    add("sakh-wan01", "Routers", "C8300-2N2S-6T", "BORDER ROUTER", loc_rz1, "C", "10.10.0.11", "17.12.4")
    add("sakh-wan02", "Routers", "C8300-2N2S-6T", "BORDER ROUTER", loc_rz2, "A", "10.10.0.12", "17.12.4")
    add("sakh-wlc01", "Wireless Controller", "C9800-40-K9", "ACCESS", loc_rz1, "C", "10.10.0.21", "17.12.4")
    add("sakh-wlc02", "Wireless Controller", "C9800-40-K9", "ACCESS", loc_rz2, "A", "10.10.0.22", "17.12.4")
    add("sakh-rz1-dc01", "Switches and Hubs", "N9K-C93180YC-FX3", "DATA CENTER", loc_rz1, "C", "10.10.0.31",
        "10.4(3)", "Nexus 9300", managed=False)
    add("sakh-rz1-dc02", "Switches and Hubs", "N9K-C93180YC-FX3", "DATA CENTER", loc_rz2, "A", "10.10.0.32",
        "10.4(3)", "Nexus 9300", managed=False)
    add("sakh-fw01", "Firewall", "FPR3110-NGFW-K9", "FIREWALL", loc_rz1, "C", "10.10.0.41", "7.4.2",
        "Secure Firewall 3100", managed=False)
    add("sakh-fw02", "Firewall", "FPR3110-NGFW-K9", "FIREWALL", loc_rz2, "A", "10.10.0.42", "7.4.2",
        "Secure Firewall 3100", managed=False)
    add("sakh-ise01", "Security Appliance", "SNS-3755-K9", "NAC", loc_rz1, "C", "10.10.0.51", "3.3 Patch 3",
        "ISE", managed=False)
    add("sakh-ise02", "Security Appliance", "SNS-3755-K9", "NAC", loc_rz2, "A", "10.10.0.52", "3.3 Patch 3",
        "ISE", managed=False)
    access = {"A": 10, "B": 10, "C": 10, "D": 8}
    for bi, b in enumerate(BUILDINGS, 1):
        code = b["code"]
        net = 20 + bi * 10
        for k in (1, 2):
            add("sakh-%s-dist%02d" % (code.lower(), k), "Switches and Hubs", "C9500-16X", "DISTRIBUTION",
                "Global/Wien/SAKH/%s/EG - Technik" % b["name"].split(" - ")[0], code, "10.%d.0.%d" % (net, k),
                "17.9.5")
        for i in range(1, access[code] + 1):
            floor = (i - 1) // 2
            r = rng("acc", code, i)
            old = r.random() < 0.3
            model = "C9200-48P" if old else ("C9300-48UXM" if r.random() < 0.6 else "C9300-48P")
            sw = "17.9.4a" if old or r.random() < 0.5 else "17.9.5"
            add("sakh-%s-acc%02d" % (code.lower(), i), "Switches and Hubs", model, "ACCESS",
                "Global/Wien/SAKH/%s/%d. OG" % (b["name"].split(" - ")[0], floor), code,
                "10.%d.1.%d" % (net, i), sw)
        for i in range(1, 31):
            floor = (i - 1) // 6
            r = rng("ap", code, i)
            u = r.random()
            model = "C9136I-E" if u < 0.35 else ("C9130AXI-E" if u < 0.8 else "AIR-AP2802I-E-K9")
            add("sakh-%s-ap%02d" % (code.lower(), i), "Unified AP", model, "ACCESS",
                "Global/Wien/SAKH/%s/%d. OG" % (b["name"].split(" - ")[0], floor), code,
                "10.%d.2.%d" % (net, i), "17.12.4" if model != "AIR-AP2802I-E-K9" else "8.10.190.0")
    return nd


NETWORK = _network()
NET = {d["name"]: d for d in NETWORK}

# ---------------------------------------------------------------- servers and databases

# host, os, role, application, building, cpu cores, ram GB, criticality, cluster
SERVERS = [
    ("sakh-dc01", "Windows Server 2022", "Active Directory DC", "Active Directory", "C", 4, 16, "hoch", "RZ1-Klinik"),
    ("sakh-dc02", "Windows Server 2022", "Active Directory DC", "Active Directory", "A", 4, 16, "hoch", "RZ2-Ausweich"),
    ("sakh-kisapp01", "Windows Server 2022", "KIS Applikationsserver", "KIS", "C", 16, 64, "kritisch", "RZ1-Klinik"),
    ("sakh-kisapp02", "Windows Server 2022", "KIS Applikationsserver", "KIS", "C", 16, 64, "kritisch", "RZ1-Klinik"),
    ("sakh-kisapp03", "Windows Server 2022", "KIS Applikationsserver", "KIS", "A", 16, 64, "kritisch", "RZ2-Ausweich"),
    ("sakh-kisapp04", "Windows Server 2022", "KIS Applikationsserver", "KIS", "A", 16, 64, "kritisch", "RZ2-Ausweich"),
    ("sakh-cvda01", "Windows Server 2022", "Citrix VDA KIS-Client", "KIS", "C", 16, 96, "hoch", "RZ1-Klinik"),
    ("sakh-cvda02", "Windows Server 2022", "Citrix VDA KIS-Client", "KIS", "C", 16, 96, "hoch", "RZ1-Klinik"),
    ("sakh-cvda03", "Windows Server 2022", "Citrix VDA KIS-Client", "KIS", "A", 16, 96, "hoch", "RZ2-Ausweich"),
    ("sakh-cvda04", "Windows Server 2022", "Citrix VDA KIS-Client", "KIS", "A", 16, 96, "hoch", "RZ2-Ausweich"),
    ("sakh-pacs01", "Windows Server 2019", "PACS Archiv", "PACS", "C", 16, 64, "kritisch", "RZ1-Klinik"),
    ("sakh-pacs02", "Windows Server 2019", "PACS Archiv", "PACS", "A", 16, 64, "kritisch", "RZ2-Ausweich"),
    ("sakh-pacsweb01", "Windows Server 2022", "PACS Webviewer", "PACS", "C", 8, 32, "hoch", "RZ1-Klinik"),
    ("sakh-ris01", "Windows Server 2022", "RIS Applikationsserver", "RIS", "C", 8, 32, "kritisch", "RZ1-Klinik"),
    ("sakh-lisapp01", "Windows Server 2022", "LIS Applikationsserver", "LIS", "C", 8, 32, "kritisch", "RZ1-Klinik"),
    ("sakh-sql01", "Windows Server 2022", "MS SQL Server (AlwaysOn)", "Datenbank", "C", 16, 128, "kritisch", "RZ1-Klinik"),
    ("sakh-sql02", "Windows Server 2022", "MS SQL Server (AlwaysOn)", "Datenbank", "A", 16, 128, "kritisch", "RZ2-Ausweich"),
    ("sakh-opapp01", "Windows Server 2022", "OP-Management", "OP-Management", "C", 8, 32, "hoch", "RZ1-Klinik"),
    ("sakh-bbapp01", "Windows Server 2022", "Blutdepot-Software", "Blutbank", "C", 4, 16, "kritisch", "RZ1-Klinik"),
    ("sakh-apo01", "Windows Server 2022", "Apothekensystem", "Apotheke", "C", 4, 16, "hoch", "RZ1-Klinik"),
    ("sakh-elga01", "Windows Server 2022", "ELGA GDA-Gateway", "eHealth", "C", 4, 16, "hoch", "RZ1-Klinik"),
    ("sakh-mtgw01", "Windows Server 2022", "Medizingeraete-Gateway", "Medizintechnik", "C", 8, 32, "hoch", "RZ1-Klinik"),
    ("sakh-ruf01", "Windows Server 2019", "Lichtrufsystem", "Lichtruf", "C", 4, 8, "kritisch", "RZ1-Klinik"),
    ("sakh-file01", "Windows Server 2022", "Fileserver", "Infrastruktur", "C", 4, 16, "mittel", "RZ1-Klinik"),
    ("sakh-print01", "Windows Server 2022", "Printserver", "Infrastruktur", "C", 4, 8, "mittel", "RZ1-Klinik"),
    ("sakh-kisdb01", "Red Hat Enterprise Linux 9.4", "Oracle Datenbank KIS (Primary)", "Datenbank", "C", 32, 512, "kritisch", "physisch"),
    ("sakh-kisdb02", "Red Hat Enterprise Linux 9.4", "Oracle Datenbank KIS (Standby)", "Datenbank", "A", 32, 512, "kritisch", "physisch"),
    ("sakh-kom01", "Red Hat Enterprise Linux 9.4", "Kommunikationsserver (HL7/FHIR)", "Kommunikationsserver", "C", 8, 64, "kritisch", "RZ1-Klinik"),
    ("sakh-kom02", "Red Hat Enterprise Linux 9.4", "Kommunikationsserver (HL7/FHIR)", "Kommunikationsserver", "A", 8, 64, "kritisch", "RZ2-Ausweich"),
    ("sakh-pdms01", "Red Hat Enterprise Linux 9.4", "PDMS Applikationsserver", "PDMS", "C", 8, 32, "kritisch", "RZ1-Klinik"),
    ("sakh-pdmsdb01", "Red Hat Enterprise Linux 9.4", "PostgreSQL PDMS", "Datenbank", "C", 8, 64, "kritisch", "RZ1-Klinik"),
    ("sakh-portal01", "Ubuntu 24.04 LTS", "Patientenportal (nginx)", "Patientenportal", "C", 4, 16, "mittel", "RZ1-Klinik"),
    ("sakh-veeam01", "Ubuntu 24.04 LTS", "Backup Repository (hardened)", "Backup", "A", 8, 64, "hoch", "physisch"),
    ("sakh-mon01", "Red Hat Enterprise Linux 9.4", "Monitoring", "Infrastruktur", "C", 4, 16, "mittel", "RZ1-Klinik"),
    ("sakh-proxy01", "Red Hat Enterprise Linux 9.4", "Reverse Proxy", "Infrastruktur", "C", 4, 8, "hoch", "RZ1-Klinik"),
]
SERVER = {s[0]: {"host": s[0], "os": s[1], "role": s[2], "application": s[3], "building": s[4],
                 "cores": s[5], "ram_gb": s[6], "criticality": s[7], "cluster": s[8],
                 "family": "windows" if s[1].startswith("Windows") else "linux"} for s in SERVERS}
WINDOWS = [h for h, s in SERVER.items() if s["family"] == "windows"]
LINUX = [h for h, s in SERVER.items() if s["family"] == "linux"]
ESX_HOSTS = [("sakh-esx%02d" % i, "RZ1-Klinik" if i <= 5 else "RZ2-Ausweich") for i in range(1, 9)]

# instance, engine, version, host, application, size GB
DATABASES = [
    ("KISPRD", "Oracle", "19.23", "sakh-kisdb01", "KIS", 4200),
    ("KISSTBY", "Oracle", "19.23", "sakh-kisdb02", "KIS (Data Guard Standby)", 4200),
    ("LISDB", "Microsoft SQL Server", "2022 CU14", "sakh-sql01", "LIS", 620),
    ("PACSDB", "Microsoft SQL Server", "2022 CU14", "sakh-sql01", "PACS", 380),
    ("RISDB", "Microsoft SQL Server", "2022 CU14", "sakh-sql01", "RIS", 210),
    ("OPDB", "Microsoft SQL Server", "2022 CU14", "sakh-sql02", "OP-Management", 160),
    ("BBANKDB", "Microsoft SQL Server", "2022 CU14", "sakh-sql02", "Blutbank", 40),
    ("APODB", "Microsoft SQL Server", "2022 CU14", "sakh-sql02", "Apotheke", 90),
    ("PDMSDB", "PostgreSQL", "16.4", "sakh-pdmsdb01", "PDMS", 1100),
    ("KOMIRIS", "InterSystems IRIS", "2024.1", "sakh-kom01", "Kommunikationsserver", 300),
    ("PORTALDB", "PostgreSQL", "16.4", "sakh-portal01", "Patientenportal", 25),
]

# channel, source system, target system, message type, msgs/min at day peak, direction
HL7_CHANNELS = [
    ("KIS_LIS_ADT", "KIS", "LIS", "ADT^A01/A02/A03/A08", 6, "out"),
    ("KIS_LIS_OML", "KIS", "LIS", "OML^O21", 14, "out"),
    ("LIS_KIS_ORU", "LIS", "KIS", "ORU^R01", 38, "in"),
    ("KIS_RIS_ADT", "KIS", "RIS", "ADT^A01/A08", 4, "out"),
    ("KIS_RIS_ORM", "KIS", "RIS", "ORM^O01", 3, "out"),
    ("RIS_KIS_ORU", "RIS", "KIS", "ORU^R01", 3, "in"),
    ("KIS_PDMS_ADT", "KIS", "PDMS", "ADT^A01/A02/A03", 2, "out"),
    ("PDMS_KIS_ORU", "PDMS", "KIS", "ORU^R01", 20, "in"),
    ("KIS_APO_RDE", "KIS", "Apotheke", "RDE^O11", 8, "out"),
    ("KIS_BB_OML", "KIS", "Blutbank", "OML^O21", 1, "out"),
    ("BB_KIS_ORU", "Blutbank", "KIS", "ORU^R01", 1, "in"),
    ("OP_KIS_SIU", "OP-Management", "KIS", "SIU^S12/S14", 2, "in"),
    ("KIS_ELGA_CDA", "KIS", "ELGA", "CDA / IHE XDS.b", 2, "out"),
    ("KIS_LKF_BAR", "KIS", "LKF-Abrechnung", "BAR^P12", 1, "out"),
]

EHEALTH_SERVICES = [
    ("ecard_ecs", "e-card Anspruchspruefung (ECS)", 22, 180),
    ("elga_ebefund", "ELGA e-Befund (XDS)", 6, 450),
    ("elga_emedikation", "ELGA e-Medikation", 5, 380),
    ("elga_eimpfpass", "ELGA e-Impfpass", 1, 300),
    ("erezept", "e-Rezept", 3, 260),
    ("zpi", "Zentraler Patientenindex (Z-PI)", 8, 210),
]

# business service, criticality, depends on applications
BUSINESS_SERVICES = [
    ("Klinische Dokumentation (KIS)", "kritisch", ["KIS", "Datenbank", "Active Directory"]),
    ("Labordiagnostik", "kritisch", ["LIS", "Kommunikationsserver", "Datenbank"]),
    ("Radiologie und Bildgebung", "kritisch", ["RIS", "PACS", "Kommunikationsserver", "Datenbank"]),
    ("Intensivmedizin (PDMS)", "kritisch", ["PDMS", "Medizintechnik", "Kommunikationsserver"]),
    ("Blutversorgung", "kritisch", ["Blutbank", "LIS", "Kommunikationsserver"]),
    ("OP-Planung", "hoch", ["OP-Management", "KIS"]),
    ("Medikation und Apotheke", "hoch", ["Apotheke", "KIS"]),
    ("ELGA und eHealth", "hoch", ["eHealth", "KIS"]),
    ("Lichtruf und Patientensicherheit", "kritisch", ["Lichtruf"]),
    ("Patientenportal", "mittel", ["Patientenportal"]),
    ("Leistungsabrechnung (LKF)", "hoch", ["KIS", "Datenbank"]),
]

SUPPORT_GROUPS = {
    "KIS": "KIS-Applikationsbetreuung", "Datenbank": "DBA-Team", "Kommunikationsserver": "Schnittstellenteam",
    "LIS": "Labor-IT", "RIS": "Radiologie-IT", "PACS": "Radiologie-IT", "PDMS": "Intensiv-IT",
    "Medizintechnik": "Medizintechnik", "Netzwerk": "Netzwerkteam", "Active Directory": "Windows-Team",
    "Infrastruktur": "Windows-Team", "Blutbank": "Labor-IT", "OP-Management": "KIS-Applikationsbetreuung",
    "Apotheke": "KIS-Applikationsbetreuung", "eHealth": "Schnittstellenteam", "Lichtruf": "Haustechnik",
    "Patientenportal": "Web-Team", "Backup": "Storage- und Backup-Team", "Security": "IT-Security (SOC)",
}
