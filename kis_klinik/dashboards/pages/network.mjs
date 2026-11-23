import { chain, column, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, IOS_REX, ISE_REX, MIDX, ringRows } from '../lib/spl.mjs';

const HEALTH = `${IDX} sourcetype="cisco:dnac:devicehealth" Building="$building$" earliest=-20m
| stats latest(HealthScore) as HealthScore latest(Reachability) as Reachability latest(DeviceFamily) as DeviceFamily latest(DeviceType) as DeviceType latest(Role) as Role latest(Location) as Location latest(SoftwareVersion) as SoftwareVersion latest(ClientCount) as ClientCount latest(Building) as Building by DeviceName`;

export default {
    id: 'kis_network',
    navLabel: 'Catalyst & ISE',
    domain: 'network',
    title: 'Campus-Netzwerk',
    subtitle: 'Cisco Catalyst Center Health, Assurance Issues, ISE-Authentifizierung der Medizingeraete, ThousandEyes und Switch-Syslog',
    description: 'Netzwerk: Catalyst Center Device Health je Haus, Issues, ISE RADIUS, ThousandEyes-Tests und IOS-XE-Syslog',
    inputs: ['time', 'building'],
    tokens: { device: '*' },
    dataSources: {
        ds_health: search(HEALTH, { name: 'Device Health' }),
        ds_k_reach: chain('ds_health', '| stats count(eval(Reachability="Reachable")) as r count as n | eval "Erreichbar %"=round(100 * r / n, 1) | fields "Erreichbar %"'),
        ds_k_down: chain('ds_health', '| where Reachability!="Reachable" | stats count as Unreachable'),
        ds_k_score: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.network.health_score" building="$building$" span=10m | rename v as "Health Score"`),
        ds_k_clients: search(`| mstats sum(_value) as v WHERE ${MIDX} metric_name="sakh.network.clients" building="$building$" span=15m | rename v as "WLAN-Clients"`),
        ds_k_p1: search(`${IDX} sourcetype="cisco:dnac:issue" Priority=P1 Building="$building$" | stats dc(IssueID) as "P1 Issues"`),
        ds_k_ise: search(`${IDX} sourcetype="cisco:ise:syslog" "CISE_Failed_Attempts" | timechart span=10m count as "ISE Fehlversuche"`),
        ds_rings: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.network.health_score" BY building
| eval key=building, name="Haus ".building, value=round(v, 1), unit="", min=0, max=10, warn=7, crit=4, better="higher" | table name value unit min max warn crit better key`, { name: 'Health je Haus' }),
        ds_heat: search(`| mstats avg(_value) as value WHERE ${MIDX} metric_name="sakh.network.health_score" building="$building$" device_family="Switches and Hubs" BY device span=10m
| timechart span=10m limit=0 avg(value) by device`, { name: 'Health je Switch' }),
        ds_issues: search(`${IDX} sourcetype="cisco:dnac:issue" Building="$building$"
| stats latest(_time) as t latest(Name) as Issue latest(Priority) as Prio latest(Category) as Kategorie latest(Description) as Beschreibung latest(Status) as Status by IssueID DeviceName
| eval Zeit=strftime(t, "%d.%m. %H:%M") | sort Prio - t | table Zeit Prio DeviceName Issue Kategorie Status Beschreibung | rename DeviceName as Geraet | head 30`),
        ds_down: chain('ds_health', `| where Reachability!="Reachable" OR HealthScore<7
| table DeviceName DeviceType Role Building Location SoftwareVersion HealthScore Reachability
| rename DeviceName as Geraet DeviceType as Modell Role as Rolle Building as Haus Location as Standort SoftwareVersion as Software HealthScore as Health Reachability as Erreichbarkeit`),
        ds_ise: search(`${IDX} sourcetype="cisco:ise:syslog" ${ISE_REX} | search ise_building="$building$" OR NOT ise_building=*
| eval Ergebnis=if(ise_category="CISE_Failed_Attempts", "fehlgeschlagen", "erfolgreich") | timechart span=10m count by Ergebnis`, { name: 'ISE RADIUS' }),
        ds_ise_profile: search(`${IDX} sourcetype="cisco:ise:syslog" ${ISE_REX} | stats count by profile | sort - count | rename profile as "ISE Profil"`),
        ds_ise_fail: search(`${IDX} sourcetype="cisco:ise:syslog" "CISE_Failed_Attempts" ${ISE_REX}
| stats count as Fehlversuche latest(failure_reason) as Grund by nad ise_building | sort - Fehlversuche | head 12 | rename nad as Switch ise_building as Haus`),
        ds_te: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.te.latency_ms", "sakh.te.loss_pct") BY metric_name agent span=10m
| eval series=agent." ".if(metric_name="sakh.te.loss_pct", "Verlust %", "Latenz ms") | timechart span=10m avg(v) by series`, { name: 'ThousandEyes' }),
        ds_syslog: search(`${IDX} sourcetype="cisco:ios" ${IOS_REX} | search device="$device$" | where severity<=4
| eval Zeit=strftime(_time, "%d.%m. %H:%M:%S") | table Zeit device severity facility mnemonic message_text
| rename device as Geraet severity as Sev facility as Facility mnemonic as Mnemonic message_text as Meldung | head 60`),
    },
    rows: [
        {
            section: 'Catalyst Center',
            h: 150,
            panels: [
                { cols: 2, title: 'Erreichbar', viz: kpi('ds_k_reach', { unit: '%', spark: false, warn: 99, crit: 95 }) },
                { cols: 2, title: 'Unreachable', viz: kpi('ds_k_down', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'Health Score', viz: kpi('ds_k_score', { decimals: 1, warn: 8, crit: 6 }) },
                { cols: 2, title: 'WLAN-Clients', viz: kpi('ds_k_clients', { decimals: 0, color: '#0a72a6' }) },
                { cols: 2, title: 'P1 Issues', viz: kpi('ds_k_p1', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'ISE Fehlversuche', viz: kpi('ds_k_ise', { decimals: 0, warn: 10, crit: 40, higher: false }) },
            ],
        },
        {
            h: 380,
            panels: [
                { cols: 4, title: 'Health je Haus', viz: custom('health_rings', 'ds_rings', { decimals: 1, drilldownToken: 'building' }, [setToken('building')]) },
                { cols: 8, title: 'Health je Switch', hint: 'Klick auf eine Zeile filtert das Syslog', viz: custom('heat_timeline', 'ds_heat', { scaleMode: 'thresholds', higherIsBetter: true, warn: 7, crit: 4, maxSeries: 60, decimals: 0, drilldownToken: 'device' }, [setToken('device')]) },
            ],
        },
        {
            h: 400,
            panels: [
                { cols: 7, title: 'Assurance Issues', viz: table('ds_issues', { count: 10 }) },
                { cols: 5, title: 'Nicht erreichbar oder schlechte Health', viz: table('ds_down', { count: 10, status: ['Erreichbarkeit'] }) },
            ],
        },
        {
            section: 'Cisco ISE',
            h: 340,
            panels: [
                { cols: 5, title: 'RADIUS-Authentifizierungen', viz: column('ds_ise', { stack: 'stacked', colors: ['#1e8a5a', '#c8253f'] }) },
                { cols: 3, title: 'Endgeraete-Profile', viz: column('ds_ise_profile', { legend: 'off' }) },
                { cols: 4, title: 'Fehlversuche je Switch', viz: table('ds_ise_fail', { count: 8 }) },
            ],
        },
        {
            section: 'ThousandEyes und Syslog',
            h: 420,
            panels: [
                { cols: 5, title: 'Latenz und Verlust je Agent', viz: line('ds_te') },
                { cols: 7, title: 'IOS-XE Syslog (Severity 0-4)', viz: table('ds_syslog', { count: 10 }) },
            ],
        },
    ],
};
