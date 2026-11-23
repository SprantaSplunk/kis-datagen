# Changelog

## 2026-11-23

### kis_studio 1.0.4

- *Zentrale Notaufnahme*: Neues Auswahlfeld *Triage-Stufe* oben auf der Seite. Es zeigt den aktiven
  Filter und setzt ihn mit *Alle Stufen* zurueck.
- *Notaufnahme-Fluss*: Die per Klick gewaehlte Stufe wird hervorgehoben, die anderen Stufen werden
  abgeblendet. Ein zweiter Klick auf dieselbe Stufe hebt den Filter auf. Der Tooltip sagt, was der
  Klick bewirkt.
- *Letzte Zugaenge* zeigt "Keine Zugaenge mit dieser Triage-Stufe im Zeitraum", statt leer zu bleiben
  (haeufig bei Stufe 1).
- Zu tun: `dist/kis_studio-1.0.4.spl` als Upgrade hochladen (*Upgrade app* ankreuzen) und Splunk
  einmal neu starten. Splunk liest die Klick-Faehigkeit der Visualisierungen nur beim Start ein.

### TA-kis-datagen 1.0.2

- ServiceNow-Changes (`snow:change_request`) sind jetzt realistisch: werktags 3 bis 7 neue Changes,
  am Wochenende 0 bis 1, aus rund 30 typischen Vorhaben (Patchdays, KIS-, PACS-, PDMS- und
  LIS-Releases, Netzwerk, Medizintechnik, Zertifikate). Jeder Change durchlaeuft *Neu*, *Bewertung*,
  *Genehmigung* (CAB, nur Normal-Changes), *Geplant*, *Implementierung*, *Review* und *Geschlossen* mit
  Abschlusscode.
- Der Input schreibt alle 15 Minuten einen Snapshot aller offenen Changes und der in den letzten 3 Tagen
  abgeschlossenen (rund 30 Datensaetze), wie ein ServiceNow-Tabellenabzug. Neue Felder: `opened_at`,
  `approval`, `close_code`, `sys_updated_on`. Bisher gab es nur 1 bis 4 Einzelereignisse pro Tag.
- Notfall-Changes aus den Szenarien bleiben im Snapshot sichtbar, solange das Szenario laeuft.
- Zu tun: `dist/TA-kis-datagen-1.0.2.tar.gz` als Upgrade hochladen (*Upgrade app* ankreuzen) und
  Splunk neu starten. Der erste Snapshot kommt sofort beim Start des Inputs.

### kis_studio 1.0.3

- *ServiceNow CMDB und ITSM*: Die Tabelle *Changes* zeigt den aktuellen Stand aus dem letzten
  Snapshot, laufende und anstehende Changes zuerst, mit Ende und Abschlusscode. Neu: Panel
  *Changes je Status*. Die Kachel heisst jetzt *Offene Changes*, *Notfall-Changes* zaehlt nur offene.
- Zu tun: zuerst `TA-kis-datagen` 1.0.2 installieren, dann `dist/kis_studio-1.0.3.spl` als Upgrade
  hochladen (*Upgrade app* ankreuzen).

### kis_studio 1.0.2

- Behoben: Leere Panels in *Notaufnahme* (*Status*, Wartende je Triage-Stufe), *Labor und Radiologie*
  (*Kritische Werte*, *TAT Notfall*, *Durchlaufzeit je Prioritaet*, *Auftraege je Modalitaet und
  Status*, *Auftraege je Geraet* und weitere) sowie *Cisco IQ* (*Kritisch betroffen*, *Advisories mit
  betroffenen Geraeten*, *Betroffene Geraete*). Ursache waren Basissuchen, die nicht alle
  Felder an die abgeleiteten Suchen weitergegeben haben. Dasselbe ist im Dashboard *Sicherheit*
  behoben.
- *Kritische Werte* und *Befunde nicht im KIS* zeigen jetzt 0 statt "keine Daten".
- Tabellen ohne Treffer zeigen jetzt eine Zeile wie "Keine Speicherfehler im Zeitraum", statt leer zu
  bleiben: *Kritische Werte*, *Umgeplante Untersuchungen*, *PACS Speicherfehler*, *Advisories mit
  betroffenen Geraeten*, *Betroffene Geraete*.
- *Medizintechnik*: Die Tabelle *STK / MTK faellig (MPBV)* erklaert die Abkuerzungen
  (Sicherheitstechnische und Messtechnische Kontrolle).
- Zu tun: `dist/kis_studio-1.0.2.spl` als Upgrade hochladen (*Upgrade app* ankreuzen). Falls
  Dashboards in der UI bearbeitet wurden, die Kopien unter `local/data/ui/views/` loeschen, sonst
  bleiben die alten Suchen aktiv.

### kis_studio 1.0.1

- *Intensiv-Monitorwand* (Dashboard *Intensiv*): Die EKG-Kurve laeuft jetzt wie an einem echten
  Bettmonitor als Sweep mit fester Zeitachse (Standard 6 Sekunden, entspricht 25 mm/s). Vorher lief sie
  rund dreimal zu schnell und auf allen Betten synchron.
- Jedes Bett hat einen eigenen Takt und eine leichte Schwankung der Schlagabstaende. Die Zahl der
  Schlaege pro Kachel entspricht der Herzfrequenz, die R-Zacken sind gleich hoch.
- Neue Option *Sweep-Dauer (Sekunden)* im Editor der Visualisierung (3 bis 12).
- Zu tun: `dist/kis_studio-1.0.1.spl` als Upgrade hochladen (*Upgrade app* ankreuzen) und den
  Browser-Cache leeren oder das Dashboard mit Shift+Reload neu laden.

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
