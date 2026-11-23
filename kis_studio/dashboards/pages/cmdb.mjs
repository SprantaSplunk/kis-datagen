import { bar, chain, column, custom, kpi, pie, search, setToken, table } from '../lib/studio.mjs';
import { IDX } from '../lib/spl.mjs';

const REL = `${IDX} sourcetype="snow:cmdb_rel_ci" earliest=-7h parent_class!="cmdb_ci_medical_device" child_class!="cmdb_ci_medical_device"
| stats latest(parent_class) as parent_class latest(child_class) as child_class by parent child
| join type=left max=1 child [search ${IDX} sourcetype="cisco:dnac:devicehealth" earliest=-15m | stats latest(Reachability) as child_status by DeviceName | rename DeviceName as child]
| join type=left max=1 child [search ${IDX} sourcetype="snow:incident" earliest=-24h priority<=2 | stats latest(state) as s by cmdb_ci | where s!="Geloest" | eval inc_status="critical" | rename cmdb_ci as child | fields child inc_status]
| eval child_status=coalesce(inc_status, child_status, "Operational")
| table parent parent_class child child_class child_status`;
const INC = `${IDX} sourcetype="snow:incident"`;

export default {
    id: 'kis_cmdb',
    navLabel: 'CMDB & ITSM',
    domain: 'it',
    title: 'ServiceNow CMDB und ITSM',
    subtitle: 'Business Services und ihre Abhaengigkeiten, Incidents, Changes und Asset-Bestand',
    description: 'ServiceNow: CMDB-Beziehungen mit Impact, offene Incidents, Changes, Configuration Items und Assets',
    inputs: ['time'],
    tokens: { ci: '*' },
    dataSources: {
        ds_rel: search(REL, { name: 'CMDB-Beziehungen mit Status' }),
        ds_inc: search(`${INC} | stats latest(state) as state latest(priority) as priority latest(priority_label) as priority_label latest(short_description) as short_description latest(assignment_group) as assignment_group latest(cmdb_ci) as cmdb_ci latest(business_service) as business_service latest(opened_at) as opened_at latest(major_incident) as major by number`, { name: 'Incidents' }),
        ds_k_open: chain('ds_inc', '| where state!="Geloest" | stats count as "Offene Incidents"'),
        ds_k_p1: chain('ds_inc', '| where state!="Geloest" AND priority=1 | stats count as "P1 offen"'),
        ds_k_major: chain('ds_inc', '| where major="true" OR major=1 | stats count as "Major Incidents"'),
        ds_chg: search(`${IDX} sourcetype="snow:change_request" earliest=-20m
| stats latest(type) as Typ latest(state) as Status latest(short_description) as Beschreibung latest(risk) as Risiko latest(assignment_group) as Gruppe latest(cmdb_ci) as CI latest(start_date) as Start latest(end_date) as Ende latest(close_code) as Abschluss by number
| eval o=case(Status="Implementierung", 0, Typ="Emergency", 1, Status="Genehmigung", 2, Status="Geplant", 3, Status="Bewertung", 4, Status="Neu", 5, Status="Review", 6, true(), 7)
| sort o Start | fields - o | rename number as Change`, { name: 'Changes (aktueller Stand)' }),
        ds_k_chg: chain('ds_chg', '| where Status!="Geschlossen" | stats count as "Offene Changes"'),
        ds_k_emg: chain('ds_chg', '| where Typ="Emergency" AND Status!="Geschlossen" | stats count as "Notfall-Changes"'),
        ds_chg_state: chain('ds_chg', '| stats count by Status'),
        ds_k_ci: search(`${IDX} sourcetype="snow:cmdb_ci_*" earliest=-7h | stats dc(sys_id) as CIs`),
        ds_inc_table: chain('ds_inc', `| search cmdb_ci="$ci$" | where state!="Geloest"
| sort priority - opened_at | table number priority_label state business_service cmdb_ci assignment_group short_description opened_at
| rename number as Incident priority_label as Prioritaet state as Status business_service as Service cmdb_ci as CI assignment_group as Gruppe short_description as Beschreibung opened_at as Eroeffnet`),
        ds_inc_group: search(`${INC} state="Neu" | timechart span=1h dc(number) by assignment_group`),
        ds_inc_svc: chain('ds_inc', '| stats count as Incidents by business_service | sort - Incidents | rename business_service as Service'),
        ds_ci_class: search(`${IDX} sourcetype="snow:cmdb_ci_*" earliest=-7h | stats dc(sys_id) as CIs by sys_class_name | sort - CIs | rename sys_class_name as Klasse`),
        ds_assets: search(`${IDX} sourcetype="snow:alm_asset" earliest=-7h | stats latest(cost) as cost latest(model_category) as cat by asset_tag | stats sum(cost) as EUR count as Assets by cat | eval "Wert (Mio EUR)"=round(EUR / 1000000, 2) | fields cat Assets "Wert (Mio EUR)" | rename cat as Kategorie`),
    },
    rows: [
        {
            section: 'Service Management',
            h: 150,
            panels: [
                { cols: 2, title: 'Offene Incidents', viz: kpi('ds_k_open', { decimals: 0, spark: false, warn: 10, crit: 20, higher: false }) },
                { cols: 2, title: 'P1 offen', viz: kpi('ds_k_p1', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'Major Incidents', viz: kpi('ds_k_major', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'Offene Changes', viz: kpi('ds_k_chg', { decimals: 0, spark: false, color: '#2dd4bf' }) },
                { cols: 2, title: 'Notfall-Changes', viz: kpi('ds_k_emg', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'Configuration Items', viz: kpi('ds_k_ci', { decimals: 0, spark: false, color: '#60a5fa' }) },
            ],
        },
        {
            section: 'Abhaengigkeiten',
            h: 620,
            panels: [
                {
                    cols: 12,
                    title: 'Business Services bis zum Netzwerk',
                    hint: 'Rot = ausgefallen oder offener P1/P2, gelb = betroffen. Hover zeigt die Kette, Klick filtert die Incidents',
                    viz: custom('dependency_graph', 'ds_rel', { drilldownToken: 'ci', maxPerLayer: 36 }, [setToken('ci')]),
                },
            ],
        },
        {
            h: 420,
            panels: [{ cols: 12, title: 'Offene Incidents (Filter per Klick im Graphen)', viz: table('ds_inc_table', { count: 10, status: ['Status'] }) }],
        },
        {
            h: 360,
            panels: [
                { cols: 5, title: 'Neue Incidents je Gruppe', viz: column('ds_inc_group', { stack: 'stacked' }) },
                { cols: 4, title: 'Incidents je Business Service', viz: bar('ds_inc_svc') },
                { cols: 3, title: 'CIs je Klasse', viz: pie('ds_ci_class') },
            ],
        },
        {
            h: 380,
            panels: [
                { cols: 7, title: 'Changes', hint: 'Laufende und anstehende zuerst, abgeschlossene der letzten 3 Tage am Ende', viz: table('ds_chg', { count: 10, status: ['Typ'] }) },
                { cols: 2, title: 'Changes je Status', viz: pie('ds_chg_state') },
                { cols: 3, title: 'Assets', viz: table('ds_assets', { count: 5 }) },
            ],
        },
    ],
};
