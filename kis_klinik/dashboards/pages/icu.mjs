import { chain, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const LATEST = `${IDX} sourcetype="sakh:pdms:vitals" earliest=-10m
| stats latest(hr) as hr latest(spo2) as spo2 latest(rr) as rr latest(nibp_sys) as nibp_sys latest(nibp_dia) as nibp_dia latest(temp_c) as temp_c latest(news2) as news2 latest(ventilated) as ventilated latest(rhythm) as rhythm latest(data_status) as data_status latest(patient_id) as patient_id latest(ward) as ward by bed`;

export default {
    id: 'kis_icu',
    navLabel: 'Intensiv',
    domain: 'care',
    title: 'Intensivstation (PDMS)',
    subtitle: 'Zentrale Monitorwand, Fruehwarn-Score NEWS2, Beatmung und Datenluecken der Geraeteanbindung',
    description: 'Intensivmedizin: Vitalwerte je Bett aus dem PDMS, NEWS2, Beatmungsgeraete und Verbindungsstatus',
    inputs: ['time'],
    tokens: { bed: '*', vent: '*' },
    extraInputs: {
        input_vent: {
            type: 'input.dropdown',
            title: 'Beatmung (Monitorwand)',
            options: {
                token: 'vent',
                defaultValue: '*',
                items: [
                    { label: 'Alle Betten', value: '*' },
                    { label: 'Beatmet', value: 'true' },
                    { label: 'Nicht beatmet', value: 'false' },
                ],
            },
        },
    },
    dataSources: {
        ds_latest: search(LATEST, { name: 'Vitalwerte (letzte 10 min)' }),
        ds_wall: chain('ds_latest', '| fillnull value="unbekannt" ventilated | search ventilated="$vent$"'),
        ds_k_beds: chain('ds_latest', '| stats count as "Belegte Betten"'),
        ds_k_vent: chain('ds_latest', '| where ventilated="true" OR ventilated=1 | stats count as Beatmet'),
        ds_k_crit: chain('ds_latest', '| where news2>=7 | stats count as "NEWS2 >= 7"'),
        ds_k_nodata: chain('ds_latest', '| where data_status!="ok" | stats count as "Ohne Daten"'),
        ds_k_spo2: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.icu.spo2" span=10m | rename v as "SpO2 Mittel"`),
        ds_k_news: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.icu.news2" span=10m | rename v as "NEWS2 Mittel"`),
        ds_heat_hr: search(`| mstats avg(_value) as value WHERE ${MIDX} metric_name="sakh.icu.hr" BY bed span=10m
| timechart span=10m limit=0 avg(value) by bed`, { name: 'Herzfrequenz je Bett' }),
        ds_heat_news: search(`| mstats max(_value) as value WHERE ${MIDX} metric_name="sakh.icu.news2" BY bed span=10m
| timechart span=10m limit=0 max(value) by bed`),
        ds_bed: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.icu.hr", "sakh.icu.spo2", "sakh.icu.rr", "sakh.icu.nibp_sys") bed="$bed$" BY metric_name span=5m
| eval series=case(metric_name="sakh.icu.hr", "HF", metric_name="sakh.icu.spo2", "SpO2", metric_name="sakh.icu.rr", "AF", true(), "RR sys")
| timechart span=5m avg(v) by series`, { name: 'Verlauf ausgewaehltes Bett' }),
        ds_vent: search(`${IDX} sourcetype="sakh:medtech:telemetry" device_type=VENT department=ICU earliest=-15m
| stats latest(in_use) as in_use latest(mode) as Modus latest(fio2_pct) as "FiO2 %" latest(peep_cmh2o) as PEEP latest(tidal_volume_ml) as "Vt ml" latest(status) as Status latest(connectivity) as Verbindung latest(manufacturer) as Hersteller latest(model) as Modell by device_id ward
| where in_use="true" OR Status="Offline" | fields - in_use | rename device_id as Geraet ward as Station`),
        ds_alarms: search(`${IDX} sourcetype="sakh:pdms:vitals" alarm!="keiner" alarm=*
| stats count as Alarme latest(news2) as "NEWS2 zuletzt" latest(alarm) as Stufe by bed | sort - Alarme | head 15 | rename bed as Bett`),
    },
    rows: [
        {
            section: 'Station',
            h: 150,
            panels: [
                { cols: 2, title: 'Belegte Betten', viz: kpi('ds_k_beds', { decimals: 0, spark: false, color: '#1e8a5a' }) },
                { cols: 2, title: 'Beatmet', viz: kpi('ds_k_vent', { decimals: 0, spark: false, color: '#6b4fb3' }) },
                { cols: 2, title: 'NEWS2 kritisch', viz: kpi('ds_k_crit', { decimals: 0, spark: false, warn: 2, crit: 4, higher: false }) },
                { cols: 2, title: 'Betten ohne Daten', viz: kpi('ds_k_nodata', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'SpO2 Mittel', viz: kpi('ds_k_spo2', { unit: '%', warn: 94, crit: 92 }) },
                { cols: 2, title: 'NEWS2 Mittel', viz: kpi('ds_k_news', { decimals: 1, warn: 4, crit: 6, higher: false }) },
            ],
        },
        {
            section: 'Monitorwand',
            h: 560,
            panels: [
                {
                    cols: 12,
                    title: 'Belegte Intensivbetten',
                    hint: 'Filter "Beatmung" oben; Klick auf ein Bett zeigt den Verlauf. Rechts oben je Bett: Ableitung und Rhythmus (SR, VHF, VES, LSB, SM, AVB1)',
                    viz: custom('icu_wall', 'ds_wall', { drilldownToken: 'bed' }, [setToken('bed')]),
                },
            ],
        },
        {
            section: 'Verlauf',
            h: 360,
            panels: [
                { cols: 6, title: 'Herzfrequenz je Bett', viz: custom('heat_timeline', 'ds_heat_hr', { scaleMode: 'thresholds', higherIsBetter: false, warn: 110, crit: 130, unit: '/min', maxSeries: 40, decimals: 0 }) },
                { cols: 6, title: 'NEWS2 je Bett', viz: custom('heat_timeline', 'ds_heat_news', { scaleMode: 'thresholds', higherIsBetter: false, warn: 5, crit: 7, maxSeries: 40, decimals: 0 }) },
            ],
        },
        {
            h: 380,
            panels: [
                { cols: 5, title: 'Verlauf des gewaehlten Betts', viz: line('ds_bed') },
                { cols: 7, title: 'Beatmungsgeraete', viz: table('ds_vent', { count: 10, status: ['Status'] }) },
            ],
        },
        {
            h: 360,
            panels: [{ cols: 12, title: 'Alarme je Bett', viz: table('ds_alarms', { count: 10 }) }],
        },
    ],
};
