[kis_datagen://<name>]
interval = Long-running input: splunkd only uses this to restart the generator if it ever stops unexpectedly. (Default: 60)
index = Target index for every source. Must exist and (HEC mode) be allowed for the HEC token. (Default: demo_sakh)
metrics_index = Metrics index (datatype metric) for the numeric time series: server, VMware, databases, HL7 channels, ThousandEyes, medical device telemetry, beds, blood bank, ICU vitals, ED board, eHealth, nursing, Catalyst health. Must exist and (HEC mode) be allowed for the HEC token. (Default: demo_sakh_metrics)
language = de or en. Language of event texts and metric dimensions. en produces the English "Splunk General Hospital" data for the kis_clinic app; with index/metrics_index left at demo_sakh/demo_sakh_metrics it writes to demo_sakh_en/demo_sakh_en_metrics instead. (Default: de)
timezone = IANA name. Daily patterns (shifts, OR plan, ED peaks) run in this zone. (Default: Europe/Vienna)
seed = Seed of the deterministic hospital model. Same seed = same curves after restart and backfill. (Default: sakh)
backfill_minutes = Runs only the first time this input starts. 1440 = one day (about 280,000 events and 1.3 million metric data points). 0 = realtime only. (Default: 1440)
max_gap_minutes = After a stop/start, gaps shorter than this are filled. Longer gaps are skipped and generation resumes at 'now'. (Default: 30)
scenario_flu_surge = Scenario: flu wave. ED arrivals x2.5, Innere/Paediatrie/Intensiv full, boarding, ambulance bypass, more influenza tests. Applied live within ~10 s. (Default: 0)
scenario_blood_shortage = Scenario: red cell concentrates 0 neg / A neg below minimum stock, elective OR cases needing blood are cancelled. (Default: 0)
scenario_mri_cooling = Scenario: MRT-1 cold head and compressor fault, helium boil-off, device blocked, MR orders moved to MRT-2/MRT-3, P1 incident. (Default: 0)
scenario_hl7_queue = Scenario: communication server sakh-kom01 /data full, HL7 queue LIS to KIS grows, lab results not delivered to the KIS, incidents. (Default: 0)
scenario_kis_db = Scenario: LKF export locks the Oracle KIS database KISPRD during the day, KIS response time and ADT latency rise, emergency change. (Default: 0)
scenario_network_building_c = Scenario: distribution switch Haus C fails after power supply and CRC warnings, access switches/APs Haus C unreachable, ICU/ED devices offline, PDMS gaps, P1 incident. (Default: 0)
scenario_cisco_psirt = Scenario: critical (synthetic) Cisco advisory for Catalyst 9200/9300 on IOS XE 17.9, vulnerable assets in Cisco IQ, emergency change, later a suspicious Web UI login and a security incident. (Default: 0)
python.required = {3.7|3.9|3.13}
* For Python scripts only, selects which Python version to use.
* Set to "3.9" to use the Python 3.9 version.
* Set to "3.13" to use the Python 3.13 version.
* Optional.
* Default: not set
