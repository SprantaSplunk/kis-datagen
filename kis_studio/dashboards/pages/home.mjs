import { custom, kpi, linkDept, link, line, search, table, chain } from '../lib/studio.mjs';
import { IDX, MIDX, ringRows } from '../lib/spl.mjs';

const BEDS = `${IDX} sourcetype="sakh:kis:beds" earliest=-15m
| stats latest(beds_total) as beds_total latest(occupied) as occupied latest(free) as free latest(occupancy_pct) as occupancy_pct latest(floor) as floor latest(ward_name) as ward_name by ward building department`;

const HEALTH = `| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.beds.occupancy_pct" BY ward
| stats avg(v) as beds
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.ed.waiting" | stats max(v) as ed]
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.blood.fill_pct" product="EK" BY blood_group | stats min(v) as blood]
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.medtech.online" BY device_id | stats avg(v) as medtech | eval medtech=round(100*medtech, 1)]
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.network.reachable" BY device | stats avg(v) as net | eval net=round(100*net, 1)]
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.hl7.queue_depth" BY channel | stats sum(v) as hl7]
| appendcols [| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.db.avg_query_ms" instance="KISPRD" | stats max(v) as kisdb]
${ringRows([
    ['Bettenbelegung', 'round(beds, 1)', '%', 0, 100, 88, 95, 'lower', 'kis_beds'],
    ['Notaufnahme wartend', 'ed', '', 0, 80, 15, 30, 'lower', 'kis_ed'],
    ['Blut EK min. Fuellung', 'round(blood, 0)', '%', 0, 120, 45, 25, 'higher', 'kis_blood'],
    ['Medizintechnik online', 'medtech', '%', 0, 100, 98, 90, 'higher', 'kis_medtech'],
    ['Netzwerk erreichbar', 'net', '%', 0, 100, 99, 95, 'higher', 'kis_network'],
    ['HL7 Warteschlange', 'hl7', '', 0, 500, 50, 200, 'lower', 'kis_integration'],
    ['KIS-DB Abfrage', 'round(kisdb, 0)', 'ms', 0, 200, 20, 60, 'lower', 'kis_servers'],
])}`;

export default {
    id: 'kis_home',
    navLabel: 'Klinik-Uebersicht',
    domain: 'home',
    title: 'Splunk Allgemeines Krankenhaus – Lagebild',
    subtitle: 'Betten, Notaufnahme, Blutdepot, Medizintechnik, Netzwerk und IT auf einen Blick',
    description: 'Klinik-Uebersicht des SAKH: freie Betten je Haus und Station, Versorgungslage und Infrastruktur-Gesundheit',
    inputs: ['time'],
    dataSources: {
        ds_beds: search(BEDS, { name: 'Bettenstatus (letzte 15 min)' }),
        ds_k_free: chain('ds_beds', '| stats sum(free) as "Freie Betten"'),
        ds_k_occ: search(`| mstats sum(sakh.beds.occupied) as o sum(sakh.beds.beds_total) as t WHERE ${MIDX} span=15m
| eval "Belegung %"=round(100 * o / t, 1) | fields _time "Belegung %"`, { name: 'Belegung Verlauf' }),
        ds_k_ed: search(`| mstats avg(_value) as w WHERE ${MIDX} metric_name="sakh.ed.waiting" span=10m | rename w as "Wartend"`),
        ds_k_blood: search(`${IDX} sourcetype="sakh:bloodbank:inventory" earliest=-20m | stats latest(status) as status by product blood_group | where status="kritisch" | stats count as "Kritische Blutbestaende"`),
        ds_k_inc: search(`${IDX} sourcetype="snow:incident" earliest=-48h | stats latest(state) as state latest(priority) as priority by number | where priority<=2 AND state!="Geloest" | stats count as "Offene P1/P2"`),
        ds_k_net: search(`| mstats latest(_value) as v WHERE ${MIDX} metric_name="sakh.network.reachable" BY device | where v=0 | stats count as "Netzwerk offline"`),
        ds_rings: search(HEALTH, { name: 'Gesundheit je Bereich' }),
        ds_trend: search(`| mstats sum(sakh.beds.occupied) as o sum(sakh.beds.beds_total) as t WHERE ${MIDX} BY building span=15m
| eval pct=round(100 * o / t, 1), building="Haus ".building
| timechart span=15m avg(pct) by building`, { name: 'Belegung je Haus' }),
        ds_incidents: search(`${IDX} sourcetype="snow:incident" earliest=-48h
| stats latest(state) as Status latest(priority_label) as Prioritaet latest(short_description) as Beschreibung latest(assignment_group) as Gruppe latest(business_service) as Service latest(_time) as t by number
| where Status!="Geloest" | sort Prioritaet - t | head 12
| eval Zeit=strftime(t, "%d.%m. %H:%M") | table Zeit number Prioritaet Status Service Gruppe Beschreibung | rename number as Incident`, { name: 'Offene Incidents' }),
    },
    rows: [
        {
            section: 'Lage jetzt',
            h: 150,
            panels: [
                { cols: 2, title: 'Freie Betten', viz: kpi('ds_k_free', { decimals: 0, spark: false, warn: 60, crit: 25, drill: link('kis_beds') }) },
                { cols: 2, title: 'Bettenbelegung', viz: kpi('ds_k_occ', { unit: '%', warn: 88, crit: 95, higher: false, drill: link('kis_beds') }) },
                { cols: 2, title: 'Notaufnahme wartend', viz: kpi('ds_k_ed', { decimals: 0, warn: 15, crit: 30, higher: false, drill: link('kis_ed') }) },
                { cols: 2, title: 'Blut kritisch', viz: kpi('ds_k_blood', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false, drill: link('kis_blood') }) },
                { cols: 2, title: 'Netzwerk offline', viz: kpi('ds_k_net', { decimals: 0, spark: false, warn: 1, crit: 5, higher: false, drill: link('kis_network') }) },
                { cols: 2, title: 'Offene P1/P2', viz: kpi('ds_k_inc', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false, drill: link('kis_cmdb') }) },
            ],
        },
        {
            section: 'Klinik-Lageplan',
            h: 470,
            panels: [
                {
                    cols: 12,
                    title: 'Stationen nach Haus und Etage',
                    hint: 'Klick auf eine Station oeffnet das Bettenmanagement fuer die Abteilung',
                    viz: custom('hospital_map', 'ds_beds', { drillField: 'department', drilldownToken: 'dept' }, [linkDept('kis_beds')]),
                },
            ],
        },
        {
            section: 'Bereiche',
            h: 300,
            panels: [
                { cols: 12, title: 'Gesundheit je Bereich', hint: 'Details ueber die Bereichsnavigation oben', viz: custom('health_rings', 'ds_rings', { drilldownToken: 'area' }) },
            ],
        },
        {
            h: 380,
            panels: [
                { cols: 5, title: 'Belegung je Haus (%)', viz: line('ds_trend', { yMin: 50, yMax: 100 }) },
                { cols: 7, title: 'Offene Incidents', viz: table('ds_incidents', { count: 10, status: ['Status'] }) },
            ],
        },
    ],
};
