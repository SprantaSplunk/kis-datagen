import { area, chain, column, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const BEDS = `${IDX} sourcetype="sakh:kis:beds" department="$dept$" building="$building$" earliest=-15m
| stats latest(beds_total) as beds_total latest(occupied) as occupied latest(free) as free latest(cleaning) as cleaning latest(blocked) as blocked latest(isolation) as isolation latest(occupancy_pct) as occupancy_pct latest(floor) as floor latest(ward_name) as ward_name latest(status) as status latest(planned_discharges_today) as planned by ward building department department_name`;

export default {
    id: 'kis_beds',
    navLabel: 'Betten',
    domain: 'care',
    title: 'Bettenmanagement',
    subtitle: 'Belegung, freie Betten, Reinigung und Isolation je Station – Filter nach Abteilung und Haus',
    description: 'Bettenmanagement: Belegung und freie Betten je Station, Aufnahmen und Entlassungen',
    inputs: ['time', 'dept', 'building'],
    dataSources: {
        ds_beds: search(BEDS, { name: 'Bettenstatus je Station' }),
        ds_k_total: chain('ds_beds', '| stats sum(beds_total) as Betten'),
        ds_k_free: chain('ds_beds', '| stats sum(free) as "Freie Betten"'),
        ds_k_clean: chain('ds_beds', '| stats sum(cleaning) as "In Reinigung"'),
        ds_k_iso: chain('ds_beds', '| stats sum(isolation) as Isolation'),
        ds_k_full: chain('ds_beds', '| where free=0 | stats count as "Volle Stationen"'),
        ds_k_occ: search(`| mstats sum(sakh.beds.occupied) as o sum(sakh.beds.beds_total) as t WHERE ${MIDX} department="$dept$" building="$building$" span=15m
| eval "Belegung %"=round(100 * o / t, 1) | fields _time "Belegung %"`),
        ds_dept_trend: search(`| mstats sum(sakh.beds.occupied) as o sum(sakh.beds.beds_total) as t WHERE ${MIDX} department="$dept$" building="$building$" BY department span=15m
| eval pct=round(100 * o / t, 1)
| timechart span=15m avg(pct) by department limit=0`, { name: 'Belegung je Abteilung' }),
        ds_heat: search(`| mstats avg(_value) as value WHERE ${MIDX} metric_name="sakh.beds.occupancy_pct" department="$dept$" building="$building$" BY ward span=15m
| timechart span=15m limit=0 avg(value) by ward`, { name: 'Belegung je Station' }),
        ds_free_trend: search(`| mstats sum(_value) as free WHERE ${MIDX} metric_name="sakh.beds.free" department="$dept$" building="$building$" BY building span=15m
| eval building="Haus ".building | timechart span=15m avg(free) by building`),
        ds_table: chain('ds_beds', `| eval Station=ward." – ".ward_name, Belegung=round(occupancy_pct, 1)
| sort - Belegung
| table Station department building beds_total occupied free cleaning blocked isolation planned Belegung status
| rename department as Abteilung building as Haus beds_total as Betten occupied as Belegt free as Frei cleaning as Reinigung blocked as Gesperrt isolation as Isolation planned as "Entlassungen geplant" status as Status`),
        ds_adt: search(`${IDX} sourcetype="sakh:kis:adt" department="$dept$" building="$building$" (event_type=A01 OR event_type=A03 OR event_type=A02)
| timechart span=30m count by event_name`, { name: 'Aufnahmen / Entlassungen' }),
        ds_adt_dept: search(`${IDX} sourcetype="sakh:kis:adt" event_type=A01 department="$dept$" building="$building$"
| stats count as Aufnahmen by department | sort - Aufnahmen`),
    },
    rows: [
        {
            section: 'Kapazitaet',
            h: 150,
            panels: [
                { cols: 2, title: 'Betten gesamt', viz: kpi('ds_k_total', { decimals: 0, spark: false, color: '#1e8a5a' }) },
                { cols: 2, title: 'Freie Betten', viz: kpi('ds_k_free', { decimals: 0, spark: false, warn: 40, crit: 15 }) },
                { cols: 2, title: 'Belegung', viz: kpi('ds_k_occ', { unit: '%', warn: 88, crit: 95, higher: false }) },
                { cols: 2, title: 'Volle Stationen', viz: kpi('ds_k_full', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'In Reinigung', viz: kpi('ds_k_clean', { decimals: 0, spark: false, color: '#0b7fab' }) },
                { cols: 2, title: 'Isolation', viz: kpi('ds_k_iso', { decimals: 0, spark: false, warn: 20, crit: 40, higher: false }) },
            ],
        },
        {
            section: 'Lageplan',
            h: 470,
            panels: [
                {
                    cols: 12,
                    title: 'Stationen',
                    hint: 'Klick auf eine Station filtert die Seite nach ihrer Abteilung',
                    viz: custom('hospital_map', 'ds_beds', { drillField: 'department', drilldownToken: 'dept' }, [setToken('dept')]),
                },
            ],
        },
        {
            section: 'Verlauf',
            h: 380,
            panels: [
                { cols: 7, title: 'Belegung je Station (%)', viz: custom('heat_timeline', 'ds_heat', { scaleMode: 'thresholds', higherIsBetter: false, warn: 88, crit: 95, unit: '%', maxSeries: 40, decimals: 0 }) },
                { cols: 5, title: 'Belegung je Abteilung (%)', viz: line('ds_dept_trend', { yMin: 40, yMax: 100 }) },
            ],
        },
        {
            h: 330,
            panels: [
                { cols: 4, title: 'Freie Betten je Haus', viz: area('ds_free_trend', { stack: 'stacked' }) },
                { cols: 5, title: 'Aufnahmen, Entlassungen, Verlegungen', viz: column('ds_adt', { stack: 'stacked' }) },
                { cols: 3, title: 'Aufnahmen je Abteilung', viz: column('ds_adt_dept', { legend: 'off' }) },
            ],
        },
        {
            section: 'Stationen im Detail',
            h: 520,
            panels: [{ cols: 12, title: 'Bettenboard', viz: table('ds_table', { count: 14, status: ['Status'], ranges: { Belegung: { warn: 88, crit: 95, higher: false } } }) }],
        },
    ],
};
