import { chain, column, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const LATEST = `${IDX} sourcetype="sakh:medtech:telemetry" department="$dept$" building="$building$" earliest=-20m
| stats latest(device_class) as device_class latest(device_type) as device_type latest(manufacturer) as manufacturer latest(model) as model latest(status) as status latest(connectivity) as connectivity latest(alarm_count) as alarms latest(ward) as ward latest(building) as building latest(department) as department by device_id`;

export default {
    id: 'kis_medtech',
    navLabel: 'Medizintechnik',
    domain: 'medtech',
    title: 'Medizintechnik und IoT',
    subtitle: 'MRT, CT, Beatmung, Monitoring, Infusionspumpen und Laboranalysatoren – Status, Alarme, Helium und STK-Faelligkeiten',
    description: 'Medizingeraete: Verbindung, Status und Alarme je Geraeteklasse, Helium und Temperaturen der MRT, STK/MTK aus dem Asset Management',
    inputs: ['time', 'dept', 'building'],
    tokens: { device: '*' },
    dataSources: {
        ds_latest: search(LATEST, { name: 'Geraetestatus' }),
        ds_k_total: chain('ds_latest', '| stats count as Geraete'),
        ds_k_online: chain('ds_latest', '| stats count(eval(connectivity="online")) as on count as n | eval "Online %"=round(100 * on / n, 1) | fields "Online %"'),
        ds_k_offline: chain('ds_latest', '| where connectivity!="online" | stats count as Offline'),
        ds_k_alarms: chain('ds_latest', '| stats sum(alarms) as "Aktive Alarme"'),
        ds_k_he: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.mri.helium_level_pct" device_id="MRT-1" span=5m | rename v as "MRT-1 Helium"`),
        ds_k_stk: search(`${IDX} sourcetype="snow:alm_asset" model_category="Medizintechnik" earliest=-7h | stats latest(u_stk_days_left) as d by asset_tag | where d<0 | stats count as "STK ueberfaellig"`),
        ds_imaging: search(`${IDX} sourcetype="sakh:medtech:telemetry" device_type IN ("MRT", "CT") earliest=-10m
| stats latest(device_type) as device_type latest(manufacturer) as manufacturer latest(model) as model latest(status) as status latest(helium_level_pct) as helium_level_pct latest(magnet_temp_k) as magnet_temp_k latest(shield_temp_k) as shield_temp_k latest(cold_head_status) as cold_head_status latest(tube_heat_pct) as tube_heat_pct latest(exams_today) as exams_today latest(scans_today) as scans_today by device_id
| eval exams_today=coalesce(exams_today, scans_today)`, { name: 'Grossgeraete' }),
        ds_he: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.mri.helium_level_pct" BY device_id span=5m
| timechart span=5m avg(v) by device_id`, { name: 'Heliumstand MRT' }),
        ds_shield: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.mri.shield_temp_k", "sakh.mri.compressor_water_temp_c") device_id="$device$" BY metric_name device_id span=5m
| eval series=device_id." ".if(metric_name="sakh.mri.shield_temp_k", "Schild K", "Kuehlwasser °C") | timechart span=5m avg(v) by series`),
        ds_class: chain('ds_latest', `| eval state=if(connectivity!="online", "Offline", if(alarms>0, "Alarm", status))
| chart count over device_class by state`),
        ds_online_trend: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.medtech.online" department="$dept$" building="$building$" BY building span=10m
| eval v=round(100 * v, 1), building="Haus ".building | timechart span=10m avg(v) by building`),
        ds_offline: chain('ds_latest', `| where connectivity!="online" OR alarms>0
| table device_id device_class manufacturer model building ward status connectivity alarms
| rename device_id as Geraet device_class as Klasse manufacturer as Hersteller model as Modell building as Haus ward as Station status as Status connectivity as Verbindung alarms as Alarme`),
        ds_stk: search(`${IDX} sourcetype="snow:alm_asset" model_category="Medizintechnik" u_department="$dept$" earliest=-7h
| stats latest(display_name) as Geraet latest(model) as Modell latest(manufacturer) as Hersteller latest(u_stk_due) as "STK faellig" latest(u_stk_days_left) as "Tage" latest(u_mtk_due) as "MTK faellig" latest(u_stk_status) as Status latest(u_department) as Abteilung by asset_tag
| where Tage < 45 | sort Tage | fields - asset_tag`),
        ds_alarm_trend: search(`| mstats sum(_value) as v WHERE ${MIDX} metric_name="sakh.medtech.alarm_count" department="$dept$" building="$building$" BY device_type span=15m
| timechart span=15m sum(v) by device_type`),
    },
    rows: [
        {
            section: 'Geraetepark',
            h: 150,
            panels: [
                { cols: 2, title: 'Vernetzte Geraete', viz: kpi('ds_k_total', { decimals: 0, spark: false, color: '#2f6fc4' }) },
                { cols: 2, title: 'Online', viz: kpi('ds_k_online', { unit: '%', spark: false, warn: 98, crit: 90 }) },
                { cols: 2, title: 'Offline', viz: kpi('ds_k_offline', { decimals: 0, spark: false, warn: 1, crit: 10, higher: false }) },
                { cols: 2, title: 'Aktive Alarme', viz: kpi('ds_k_alarms', { decimals: 0, spark: false, warn: 5, crit: 15, higher: false }) },
                { cols: 2, title: 'MRT-1 Helium', viz: kpi('ds_k_he', { unit: '%', decimals: 1, warn: 80, crit: 70 }) },
                { cols: 2, title: 'STK ueberfaellig', viz: kpi('ds_k_stk', { decimals: 0, spark: false, warn: 1, crit: 5, higher: false }) },
            ],
        },
        {
            section: 'Radiologische Grossgeraete',
            h: 340,
            panels: [
                {
                    cols: 12,
                    title: 'MRT und CT',
                    hint: 'Klick auf ein Geraet zeigt Schild- und Kuehlwassertemperatur',
                    viz: custom('imaging_status', 'ds_imaging', { drilldownToken: 'device' }, [setToken('device')]),
                },
            ],
        },
        {
            h: 340,
            panels: [
                { cols: 6, title: 'Heliumstand (%)', viz: line('ds_he', { yMin: 50, yMax: 100 }) },
                { cols: 6, title: 'Kuehlung des gewaehlten Geraets', viz: line('ds_shield') },
            ],
        },
        {
            section: 'Alle Geraeteklassen',
            h: 360,
            panels: [
                { cols: 5, title: 'Status je Geraeteklasse', viz: column('ds_class', { stack: 'stacked', colors: ['#1e8a5a', '#c98a00', '#c8253f', '#0b7fab', '#6b4fb3', '#2f6fc4'] }) },
                { cols: 4, title: 'Online je Haus (%)', viz: line('ds_online_trend', { yMin: 0, yMax: 100 }) },
                { cols: 3, title: 'Alarme je Geraetetyp', viz: column('ds_alarm_trend', { stack: 'stacked' }) },
            ],
        },
        {
            h: 420,
            panels: [
                { cols: 7, title: 'Offline oder mit Alarm', viz: table('ds_offline', { count: 10, status: ['Status', 'Verbindung'] }) },
                { cols: 5, title: 'STK / MTK faellig (MPBV)', hint: 'STK = Sicherheitstechnische Kontrolle, MTK = Messtechnische Kontrolle, Tage = Tage bis zur STK', viz: table('ds_stk', { count: 10, status: ['Status'], ranges: { Tage: { warn: 30, crit: 0 } } }) },
            ],
        },
    ],
};
