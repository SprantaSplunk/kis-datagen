# kis-datagen – Splunk Allgemeines Krankenhaus (SAKH)

Zwei Splunk-Apps fuer Demos rund um ein oesterreichisches Krankenhausinformationssystem (KIS):

| App | Version | Datei | Zweck |
| --- | --- | --- | --- |
| [TA-kis-datagen](TA-kis-datagen/README.txt) | 1.0.6 | `dist/TA-kis-datagen-1.0.6.tar.gz` | Datengenerator: KIS, Medizintechnik, Cisco-Netzwerk inkl. Cisco IQ, Server, Datenbanken, ServiceNow – per HEC oder direkt |
| [kis_klinik](kis_klinik/README.md) | 1.0.4 | `dist/kis_klinik-1.0.4.spl` | Dashboard Studio im hellen, klinischen Design: 15 Dashboards, 10 interaktive Canvas-Visualisierungen |

Indexe (werden von TA-kis-datagen angelegt):

| Index | Typ | Inhalt |
| --- | --- | --- |
| `demo_sakh` | event | 38 Sourcetypes: KIS-Ereignisse, Logs, Snapshots, CMDB |
| `demo_sakh_metrics` | metric | numerische Zeitreihen `sakh.*` (Server, VMware, Datenbanken, HL7, ThousandEyes, Medizintechnik, Betten, Blutdepot, Intensiv, Notaufnahme, eHealth, Pflege, Catalyst Health) |

Der HEC-Token muss beide Indexe erlauben.

## Schnellstart

1. `dist/TA-kis-datagen-1.0.6.tar.gz` installieren, *Configuration → HEC Setup* ausfuellen.
2. *Inputs → Create New Input → SAKH Krankenhaus* anlegen (Standardwerte passen, Backfill 24 h).
3. `dist/kis_klinik-1.0.4.spl` installieren (Splunk 10.4+), *KIS Klinik (SAKH)* oeffnen.
4. Fuer eine Demo ein Szenario im Input einschalten, z. B. *Netzwerkausfall Haus C* oder
   *Blutkonserven-Engpass*. Die Vorwarnsignale erscheinen sofort, die Auswirkung nach rund 6 Minuten.

## Repository

```
TA-kis-datagen/        Add-on (UCC-Layout); Generator in bin/kis_sim/
kis_klinik/            Dashboard-Studio-Projekt (Visualisierungen, Seiten, Harness, Packaging)
tests/                 Tests mit simulierter Uhr fuer den Generator (python3 tests/test_kis_sim.py)
tools/                 rebuild_ucc_config.py (globalConfig/openapi), make_icons.py (App-Icons)
dist/                  installierbare Pakete
```

Alle Patientendaten sind synthetisch. Cisco-IQ-Advisories, CVE-Nummern und Field Notices sind
erfunden und als Demo gekennzeichnet.
