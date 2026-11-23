import { chain, column, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const SRV = `| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.server.cpu_pct", "sakh.server.mem_pct", "sakh.server.fs_data_used_pct", "sakh.server.iowait_pct", "sakh.server.disk_c_free_pct") building="$building$" BY metric_name host application os_family span=5m`;
const DB = `| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.db.avg_query_ms", "sakh.db.blocked_sessions", "sakh.db.active_sessions", "sakh.db.tps", "sakh.db.replication_lag_s", "sakh.db.cpu_pct") BY metric_name instance engine host span=5m`;

export default {
    id: 'kis_servers',
    navLabel: 'Server & Datenbanken',
    domain: 'it',
    title: 'Server, Datenbanken und Virtualisierung',
    subtitle: 'Windows- und Linux-Server, Oracle/MS SQL/PostgreSQL/IRIS, VMware-Cluster und Backup – aus dem Metrik-Index demo_sakh_metrics',
    description: 'IT-Infrastruktur des SAKH: Server-Performance, Datenbank-KPIs, ESXi-Hosts, Backups und Windows-/Linux-Logs',
    inputs: ['time', 'building'],
    tokens: { host: '*' },
    dataSources: {
        ds_srv: search(SRV, { name: 'Server-Metriken (5 min)' }),
        ds_db: search(DB, { name: 'Datenbank-Metriken (5 min)' }),
        ds_k_cpu: chain('ds_srv', '| where metric_name="sakh.server.cpu_pct" | timechart span=5m max(v) as "CPU max"'),
        ds_k_q: chain('ds_db', '| where metric_name="sakh.db.avg_query_ms" AND instance="KISPRD" | timechart span=5m avg(v) as "KISPRD Abfrage ms"'),
        ds_k_block: chain('ds_db', '| where metric_name="sakh.db.blocked_sessions" | timechart span=5m sum(v) as "Gesperrte Sessions"'),
        ds_k_lag: chain('ds_db', '| where metric_name="sakh.db.replication_lag_s" AND instance="KISSTBY" | timechart span=5m avg(v) as "Data Guard Lag s"'),
        ds_k_esx: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.vmware.cpu_pct" span=5m | rename v as "ESXi CPU"`),
        ds_k_bkp: search(`${IDX} sourcetype="sakh:backup" status="Failed" earliest=-24h | stats count as "Backups fehlgeschlagen"`),
        ds_heat_cpu: chain('ds_srv', '| where metric_name="sakh.server.cpu_pct" | timechart span=5m limit=0 avg(v) by host'),
        ds_fs: chain('ds_srv', '| where metric_name="sakh.server.fs_data_used_pct" | timechart span=5m limit=0 max(v) by host'),
        ds_host: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.server.cpu_pct", "sakh.server.mem_pct", "sakh.server.iowait_pct", "sakh.server.fs_data_used_pct") host="$host$" BY metric_name span=5m
| eval series=replace(metric_name, "sakh.server.", "") | timechart span=5m avg(v) by series`),
        ds_db_q: chain('ds_db', '| where metric_name="sakh.db.avg_query_ms" | timechart span=5m avg(v) by instance'),
        ds_db_block: chain('ds_db', '| where metric_name IN ("sakh.db.blocked_sessions", "sakh.db.active_sessions") AND instance="KISPRD" | eval series=if(metric_name="sakh.db.blocked_sessions", "gesperrt", "aktiv") | timechart span=5m avg(v) by series'),
        ds_db_table: search(`${IDX} sourcetype="sakh:db:performance" earliest=-10m
| stats latest(engine) as Engine latest(version) as Version latest(host) as Host latest(application) as Anwendung latest(avg_query_ms) as "Abfrage ms" latest(active_sessions) as Sessions latest(blocked_sessions) as Gesperrt latest(top_wait_event) as "Top Wait" latest(replication_lag_s) as "Lag s" latest(status) as Status by instance
| rename instance as Instanz`),
        ds_esx: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.vmware.cpu_pct", "sakh.vmware.datastore_latency_ms") BY metric_name host cluster span=5m
| eval series=host." ".if(metric_name="sakh.vmware.cpu_pct", "CPU %", "DS ms") | timechart span=5m avg(v) by series limit=0`),
        ds_srv_table: chain('ds_srv', `| stats latest(v) as v by host application os_family metric_name
| eval m=case(metric_name="sakh.server.cpu_pct", "CPU %", metric_name="sakh.server.mem_pct", "RAM %", metric_name="sakh.server.fs_data_used_pct", "/data %", metric_name="sakh.server.iowait_pct", "IO-Wait %", true(), "C: frei %"), v=round(v, 1), key=host."|".application."|".os_family
| chart first(v) over key by m
| eval f=split(key, "|"), Server=mvindex(f, 0), Anwendung=mvindex(f, 1), OS=mvindex(f, 2) | fields - key f | table Server Anwendung OS *`),
        ds_backup: search(`${IDX} sourcetype="sakh:backup" type!="repository" earliest=-24h
| stats latest(status) as Status latest(duration_s) as Dauer latest(size_gb) as GB latest(end) as e latest(message) as Meldung by job host
| eval Ende=strftime(e, "%d.%m. %H:%M"), Dauer=round(Dauer / 60, 0)." min" | eval s=case(Status="Failed", 0, Status="Warning", 1, true(), 2) | sort s job | fields - e s
| rename job as Job host as Server`),
        ds_winevents: search(`${IDX} sourcetype="WinEventLog" (Type=Error OR Type=Warning OR EventCode=4625 OR EventCode=4740)
| stats count as Anzahl latest(_time) as t latest(Message) as Meldung by ComputerName EventCode Type
| eval Zeit=strftime(t, "%H:%M:%S"), ComputerName=replace(ComputerName, "\\\\.sakh\\\\.local$", "") | sort - Anzahl | head 20 | table Zeit ComputerName Type EventCode Anzahl Meldung
| rename ComputerName as Server Type as Typ EventCode as "Event-ID"`),
        ds_linux: search(`${IDX} sourcetype="syslog" ("error" OR "No space" OR "ORA-" OR "Failed password" OR "warning")
| rex "^\\\\w+\\\\s+\\\\d+ [\\\\d:]+ (?<srv>\\\\S+) (?<proc>[^:]+): (?<msg>.*)$"
| eval Zeit=strftime(_time, "%d.%m. %H:%M:%S") | table Zeit srv proc msg | rename srv as Server proc as Prozess msg as Meldung | head 40`),
    },
    rows: [
        {
            section: 'Kennzahlen',
            h: 150,
            panels: [
                { cols: 2, title: 'Server CPU max', viz: kpi('ds_k_cpu', { unit: '%', warn: 80, crit: 92, higher: false }) },
                { cols: 2, title: 'KISPRD Abfragezeit', viz: kpi('ds_k_q', { unit: 'ms', decimals: 0, warn: 20, crit: 60, higher: false }) },
                { cols: 2, title: 'Gesperrte DB-Sessions', viz: kpi('ds_k_block', { decimals: 0, warn: 5, crit: 20, higher: false }) },
                { cols: 2, title: 'Data Guard Lag', viz: kpi('ds_k_lag', { unit: 's', decimals: 0, warn: 30, crit: 60, higher: false }) },
                { cols: 2, title: 'ESXi CPU', viz: kpi('ds_k_esx', { unit: '%', warn: 70, crit: 85, higher: false }) },
                { cols: 2, title: 'Backups fehlgeschlagen', viz: kpi('ds_k_bkp', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
            ],
        },
        {
            section: 'Server',
            h: 420,
            panels: [
                { cols: 8, title: 'CPU je Server (%)', hint: 'Klick auf eine Zeile waehlt den Server', viz: custom('heat_timeline', 'ds_heat_cpu', { scaleMode: 'thresholds', higherIsBetter: false, warn: 70, crit: 85, unit: '%', maxSeries: 40, decimals: 0, drilldownToken: 'host' }, [setToken('host')]) },
                { cols: 4, title: 'Gewaehlter Server', viz: line('ds_host', { yMin: 0, yMax: 100 }) },
            ],
        },
        {
            h: 420,
            panels: [
                { cols: 4, title: 'Datenpartition /data (%)', viz: line('ds_fs', { legend: 'off', yMax: 100 }) },
                { cols: 8, title: 'Serveruebersicht', viz: table('ds_srv_table', { count: 10, ranges: { 'CPU %': { warn: 70, crit: 85, higher: false }, '/data %': { warn: 85, crit: 95, higher: false }, 'RAM %': { warn: 85, crit: 95, higher: false } } }) },
            ],
        },
        {
            section: 'Datenbanken',
            h: 360,
            panels: [
                { cols: 6, title: 'Mittlere Abfragezeit je Instanz (ms)', viz: line('ds_db_q') },
                { cols: 6, title: 'KISPRD Sessions', viz: column('ds_db_block', { stack: 'stacked', colors: ['#0b7fab', '#c8253f'] }) },
            ],
        },
        {
            h: 380,
            panels: [{ cols: 12, title: 'Datenbank-Instanzen', viz: table('ds_db_table', { count: 11, status: ['Status'], ranges: { 'Abfrage ms': { warn: 20, crit: 60, higher: false } } }) }],
        },
        {
            section: 'Virtualisierung und Backup',
            h: 380,
            panels: [
                { cols: 6, title: 'ESXi CPU und Datastore-Latenz', viz: line('ds_esx') },
                { cols: 6, title: 'Backup-Jobs (24 h)', viz: table('ds_backup', { count: 10, status: ['Status'] }) },
            ],
        },
        {
            section: 'Logs',
            h: 400,
            panels: [
                { cols: 6, title: 'Windows-Ereignisse (Fehler, Warnungen, Anmeldefehler)', viz: table('ds_winevents', { count: 10, status: ['Typ'] }) },
                { cols: 6, title: 'Linux-Syslog', viz: table('ds_linux', { count: 10 }) },
            ],
        },
    ],
};
