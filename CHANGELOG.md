# Changelog

## 2026-11-23

### TA-kis-datagen 1.0.1

- Behoben: Auf der Seite *Inputs* liess sich kein Input anlegen ("Something went wrong"). Splunk hat
  den Input *SAKH Krankenhaus (KIS, Medizintechnik, IT-Infrastruktur)* nicht geladen, weil die App das
  reservierte Argument `index` selbst deklariert hat. Der *Event-Index* bleibt im Input einstellbar.
- App-Logo ergaenzt (kein 404 mehr auf `appLogo.png`).
- Zu tun: `dist/TA-kis-datagen-1.0.1.tar.gz` ueber die bestehende Installation hochladen
  (*Upgrade app* ankreuzen), danach Splunk neu starten und den Input anlegen.

### TA-kis-datagen 1.0.0

- Neues Add-on mit dem Input *SAKH Krankenhaus (KIS, Medizintechnik, IT-Infrastruktur)*: ein Input
  erzeugt 41 Datenquellen des Splunk Allgemeinen Krankenhauses (KIS ADT, Betten, Notaufnahme, Labor,
  Blutdepot, Radiologie/PACS, OP, PDMS, Apotheke, Pflege, Lichtruf, LKF, ELGA/e-card,
  Kommunikationsserver, Medizintechnik, Catalyst Center, IOS-XE-Syslog, ISE, ThousandEyes, Cisco IQ,
  Windows, Linux, Datenbanken, VMware, Backup, ServiceNow CMDB/Assets/Incidents/Changes).
- Legt die Indexe `demo_sakh` (Events) und `demo_sakh_metrics` (Metriken) an. Der HEC-Token muss beide
  erlauben; Event- und Metrik-Index sind im Input einstellbar (*Event-Index*, *Metrik-Index*).
- Server-, Linux- und VMware-Performance laufen nur als Metriken; Datenbanken, HL7-Kanaele,
  ThousandEyes, Medizintechnik, Betten, Blutdepot, Intensiv-Vitalwerte, Notaufnahme-Board, eHealth,
  Pflegebesetzung und Catalyst Health zusaetzlich zu den Events als Metriken.
- Sieben Szenarien als Checkboxen im Input: *Grippewelle*, *Blutkonserven-Engpass*,
  *MRT-1 Kuehlungsausfall*, *HL7-Stau*, *KIS-Datenbank*, *Netzwerkausfall Haus C*, *Cisco PSIRT*.
  Sie wirken live; zuerst kommen Vorwarnsignale, nach rund 6 Minuten die Auswirkung.
- Installation: App hochladen, *Configuration → HEC Setup* ausfuellen, Input anlegen. Der Backfill
  (Standard 24 Stunden) laeuft nur beim ersten Start.

### kis_studio 1.0.0

- Neue Dashboard-Studio-App *KIS Studio (SAKH)* mit 15 Dashboards: Klinik-Uebersicht, Betten,
  Notaufnahme, OP, Intensiv, Labor & Radiologie, Blutdepot, Apotheke & Pflege, Medizintechnik,
  Catalyst & ISE, Cisco IQ, Server & Datenbanken, HL7 & eHealth, CMDB & ITSM, Sicherheit.
- Filter nach Abteilung und Haus, Drilldowns per Klick (Station, Triage-Stufe, OP-Saal, Bett,
  Blutgruppe, Geraet, Switch, Advisory, Kanal, CI).
- Zehn Canvas-Visualisierungen (Kategorie *SAKH*): Klinik-Lageplan, Blutdepot, Notaufnahme-Fluss,
  OP-Saalplan, Intensiv-Monitorwand, Schnittstellen-Fluss, Bildgebung, Service-Abhaengigkeiten,
  Health Rings, Heat Timeline.
- Zeitreihen kommen per `mstats` aus `demo_sakh_metrics`, alles mit Status-Texten aus `demo_sakh`.
- Benoetigt Splunk 10.4 oder neuer und TA-kis-datagen 1.0.0.
