# TA-kis-datagen – KIS Datagen (Splunk Allgemeines Krankenhaus SAKH)

Demo-Datengenerator fuer ein Wiener Schwerpunktkrankenhaus mit rund 790 Betten in vier Haeusern:
Krankenhausinformationssystem (KIS) und Subsysteme, Medizintechnik-IoT, Cisco-Netzwerk inkl. Cisco IQ,
Windows-/Linux-Server, Datenbanken, VMware, Backup und ServiceNow CMDB/ITSM. Start/Stop ueber die
Inputs-Seite, Versand per HEC (Standard) oder direkt in die Indexe.

Alle Patientendaten sind synthetisch (Fall-/Patienten-IDs, Alter, Geschlecht – keine Namen).
Cisco-IQ-Advisories, CVEs (CVE-2026-99xxx) und Field Notices sind erfunden und als `(Demo)` bzw.
`synthetic=true` gekennzeichnet.

## Vor der Installation

| # | Was | Warum |
|---|-----|-------|
| 1 | HEC-Token, dessen *Allowed Indexes* `demo_sakh` **und** `demo_sakh_metrics` enthalten, fuer englische Inputs zusaetzlich `demo_sakh_en` und `demo_sakh_en_metrics` | Jedes Event traegt seinen Index; fehlt einer → `Incorrect index` (Code 7). |
| 2 | HEC-URL | Splunk Cloud: `https://http-inputs-<stack>.splunkcloud.com:443` · Enterprise: `https://<host>:8088` |
| 3 | Rolle `sc_admin` (Cloud) / `admin` | Private App hochladen, Inputs anlegen. |

Die App legt alle vier Indexe an (`default/indexes.conf`, 30 Tage Aufbewahrung):

| Index | Typ | Inhalt |
|---|---|---|
| `demo_sakh` | event | alle Ereignisse, Logs und Snapshots (38 Sourcetypes) |
| `demo_sakh_metrics` | metric | numerische Zeitreihen (`sakh.*`, Sourcetype `sakh:metrics`) |
| `demo_sakh_en` | event | wie `demo_sakh`, englische Inputs (App `kis_clinic`) |
| `demo_sakh_en_metrics` | metric | wie `demo_sakh_metrics`, englische Inputs |

## Einrichtung

1. App installieren (`TA-kis-datagen-1.1.0.tar.gz`).
2. *Configuration → HEC Setup*: Modus HEC, URL und Token eintragen (Token wird geprueft und
   verschluesselt gespeichert). Ohne HEC: Modus *Direct*.
3. *Inputs → Create New Input → SAKH Krankenhaus*: Name vergeben, Standardwerte passen
   (Index `demo_sakh`, Metrik-Index `demo_sakh_metrics`, Zeitzone Europe/Vienna, Backfill 1440 min).
4. Szenarien bei Bedarf per Checkbox einschalten – sie wirken live nach ca. 10 Sekunden.

## Englische Daten (Splunk General Hospital)

*Sprache / Language* im Input waehlt die Sprache der Events und Metrik-Dimensionen (Standard Deutsch).
Mit *English* schreibt der Generator dieselben Datenquellen auf Englisch, passend zur App
`kis_clinic`: Statuswerte, Freitexte, Stationen, Diagnosen, Geraetetypen sowie die Quellen
(`source`), z. B. `bloodbank:stock` statt `blutdepot:bestand`. Feldnamen, Sourcetypes und
Metriknamen bleiben gleich, Abteilungskuerzel und Geraete-IDs (z. B. MRT-1) ebenso.

Stehen die Indizes auf den Standardwerten `demo_sakh` / `demo_sakh_metrics`, schreibt ein englischer
Input automatisch nach `demo_sakh_en` / `demo_sakh_en_metrics`, damit sich deutsche und englische
Daten nicht mischen. Fuer eine Demo in beiden Sprachen zwei Inputs anlegen, einen je Sprache.

Volumen: rund 280.000 Events (ca. 100 MB) und 1,3 Mio. Metrik-Datenpunkte pro Tag.

## Datenquellen (Index demo_sakh)

| Bereich | Sourcetype | Inhalt |
|---|---|---|
| KIS | `sakh:kis:adt` | Aufnahme, Verlegung, Entlassung, Stammdatenaenderung (HL7 ADT A01/A02/A03/A08) |
| KIS | `sakh:kis:beds` | Bettenstatus je Station alle 5 min: belegt, frei, Reinigung, gesperrt, Isolation |
| KIS | `sakh:kis:audit` | Zugriffsprotokoll inkl. Antwortzeit und Break-the-Glass |
| Notaufnahme | `sakh:ed:tracking` | Zugaenge mit Manchester-Triage, Board-Status alle 5 min |
| Labor | `sakh:lis:result` | Befunde mit Flags, TAT und Zustellstatus ins KIS |
| Labor | `sakh:lis:critical` | Kritische Werte: telefonisch mitgeteilt, nach 30 und 90 min eskaliert (mit Grund), quittiert (wer, wie, nach wie vielen Minuten) |
| Blutdepot | `sakh:bloodbank:inventory` | Bestand EK/TK/FFP je Blutgruppe alle 10 min |
| Blutdepot | `sakh:bloodbank:transfusion` | Ausgaben und Transfusionen |
| Radiologie | `sakh:ris:order` | RIS-Auftraege je Modalitaet und Geraet |
| Radiologie | `sakh:pacs:dicom` | DICOM C-STORE ins PACS |
| OP | `sakh:or:case` | Tagesplan, OP-Meilensteine, Saalstatus alle 5 min |
| Intensiv | `sakh:pdms:vitals` | Vitalwerte und NEWS2 je belegtem Intensivbett alle 2 min |
| Apotheke | `sakh:pharmacy` | Ausgaben, Bestand, BASG-Lieferengpaesse |
| Pflege | `sakh:nursing:staffing` | Besetzung je Station und Dienst |
| Pflege | `sakh:nursecall` | Lichtruf mit Reaktionszeit |
| Abrechnung | `sakh:billing` | LKF-Kodierung, LKF-Export-Batch |
| eHealth | `sakh:ehealth` | ELGA e-Befund, e-Medikation, e-Impfpass, e-card (ECS), e-Rezept, Z-PI; ELGA-Dokumente |
| Integration | `sakh:hl7:engine` | 14 Kanaele des Kommunikationsservers: Durchsatz, Warteschlange, Latenz, ACK-Fehler |
| Medizintechnik | `sakh:medtech:telemetry` | MRT (Helium, Magnet, Kaltkopf), CT, Roentgen, Angio, Ultraschall, Beatmung, Monitore, Infusionspumpen, Narkose, Laboranalysatoren |
| Netzwerk | `cisco:dnac:devicehealth`, `cisco:dnac:issue` | Catalyst Center Device Health und Assurance Issues |
| Netzwerk | `cisco:ios` | IOS-XE-Syslog (Rohformat) |
| Netzwerk | `cisco:ise:syslog` | ISE RADIUS inkl. Profiling der Medizingeraete (Rohformat) |
| Netzwerk | `sakh:thousandeyes:test` | HTTP-Tests zu ELGA, e-card GIN, M365, Patientenportal |
| Cisco IQ | `cisco:iq:asset`, `cisco:iq:advisory`, `cisco:iq:fieldnotice`, `cisco:iq:contract` | Inventar, Lifecycle, PSIRT, Field Notices, SNTC-Vertraege |
| Server | `WinEventLog` | Security, System und Application (klassisches key=value-Format) |
| Server | `syslog` | Linux-Syslog |
| Datenbanken | `sakh:db:performance` | Oracle KISPRD/KISSTBY, MS SQL, PostgreSQL, InterSystems IRIS |
| Backup | `sakh:backup` | Veeam-/RMAN-Jobs, Repository- und PACS-Archivkapazitaet |
| ServiceNow | `snow:cmdb_ci_server`, `snow:cmdb_ci_netgear`, `snow:cmdb_ci_medical_device`, `snow:cmdb_ci_service`, `snow:cmdb_rel_ci`, `snow:alm_asset` | CMDB und Assets inkl. STK/MTK-Faelligkeit |
| ServiceNow | `snow:incident`, `snow:change_request` | Incidents und Changes |

## Metriken (Index demo_sakh_metrics)

Reine Performance-Zaehler werden **nur** als Metriken geschrieben. Quellen, deren Events zusaetzlich
Status-Texte fuer Dashboards und Szenarien tragen, werden **doppelt** geschrieben: Event in `demo_sakh`,
Zahlen als Metrik in `demo_sakh_metrics`.

| Quelle | Schreibweise | Metrik-Praefix | Dimensionen |
|---|---|---|---|
| Windows-Performance | nur Metrik | `sakh.server.*` | host, os, role, application, building, os_family |
| Linux-Performance | nur Metrik | `sakh.server.*` | host, os, role, application, building, os_family |
| VMware ESXi | nur Metrik | `sakh.vmware.*` | host, cluster, datastore |
| Datenbanken | Event + Metrik | `sakh.db.*` | instance, engine, host, application |
| HL7-Kanaele | Event + Metrik | `sakh.hl7.*` | channel, source_system, target_system, direction |
| ThousandEyes | Event + Metrik | `sakh.te.*` | test_name, agent, building |
| Medizintechnik | Event + Metrik | `sakh.medtech.online`, `sakh.medtech.alarm_count`, `sakh.mri.*`, `sakh.ct.*`, `sakh.lab.*`, `sakh.ventilator.*`, `sakh.pump.*`, `sakh.monitor.*`, … | device_id, device_type, manufacturer, model, building, ward, department |
| Betten | Event + Metrik | `sakh.beds.*` | ward, department, building |
| Blutdepot | Event + Metrik | `sakh.blood.*` | product, blood_group |
| Intensiv-Vitalwerte | Event + Metrik | `sakh.icu.*` | bed, ward, department, building |
| Notaufnahme-Board | Event + Metrik | `sakh.ed.*` | department, building |
| eHealth-Dienste | Event + Metrik | `sakh.ehealth.*` | service, service_name |
| Pflegebesetzung | Event + Metrik | `sakh.nursing.*` | ward, department, building, shift |
| Catalyst Health | Event + Metrik | `sakh.network.*` (health_score, cpu_pct, mem_pct, clients, reachable, …) | device, device_family, role, building |

HEC-Modus: native Metrik-Events (`"event":"metric"`, `fields` mit `metric_name:<name>` und Dimensionen).
Direct-Modus: eine JSON-Zeile je Messwert (Sourcetype `sakh:metrics:direct`), aus der die
Index-Time-Transforms `sakh_metric_dims` / `sakh_metric_value` den Metrik-Datenpunkt bauen.

```spl
| mstats avg(_value) WHERE index=demo_sakh_metrics metric_name="sakh.mri.helium_level_pct" BY device_id span=5m
```

## Szenarien

Jedes Szenario beginnt mit Vorwarnsignalen (ca. 6 Minuten), danach folgt die Auswirkung.

| Checkbox | Ablauf |
|---|---|
| Grippewelle | Notaufnahme-Zugaenge x2,5, Innere/Paediatrie/Intensiv voll, Boarding, Rettungsstopp, mehr Influenza-Tests |
| Blutkonserven-Engpass | EK 0 neg / A neg unter Mindestbestand, OPs mit Blutbedarf werden abgesetzt, P1-Incident |
| MRT-1 Kuehlungsausfall | Schildtemperatur steigt, dann Kaltkopf-/Kompressorfehler, Helium sinkt, MRT-1 gesperrt, Termine umgeplant |
| HL7-Stau | `/data` auf sakh-kom01 laeuft voll, Kanal LIS_KIS_ORU staut, Laborbefunde fehlen im KIS |
| KIS-Datenbank | LKF-Export sperrt KISPRD, KIS-Antwortzeit und ADT-Latenz steigen, Notfall-Change |
| Netzwerkausfall Haus C | Netzteil- und CRC-Warnungen, dann Ausfall Distribution Haus C, Intensiv-/Notaufnahme-Geraete offline, PDMS-Luecken |
| Cisco PSIRT | kritische (Demo-)Sicherheitsluecke fuer Catalyst 9200/9300, betroffene Assets in Cisco IQ, Notfall-Change, spaeter verdaechtiger Web-UI-Login |

## Betrieb

* Dauerhaft laufender Input; `interval` dient nur dem Neustart durch splunkd.
* Fortschritt und Szenario-Startzeiten werden jede Minute im KV Store und lokal gesichert. Luecken bis
  *Luecken fuellen bis* werden nachgeneriert, der Backfill laeuft nur beim ersten Start.
* Gleicher Seed = gleiche Kurven nach Neustart und Backfill.
* Logs: `index=_internal source=*ta-kis-datagen_kis_datagen_*`
