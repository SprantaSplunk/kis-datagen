import { bar, chain, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const INV = `${IDX} sourcetype="sakh:bloodbank:inventory" earliest=-20m
| stats latest(units_available) as units_available latest(min_stock) as min_stock latest(target_stock) as target_stock latest(expiring_48h) as expiring_48h latest(units_reserved) as units_reserved latest(days_of_supply) as days_of_supply latest(status) as status by product product_name blood_group`;

export default {
    id: 'kis_blood',
    navLabel: 'Blutdepot',
    domain: 'diag',
    title: 'Blutdepot',
    subtitle: 'Blutkonserven-Reserven je Produkt und Blutgruppe, Reichweite, Verfall und Transfusionen',
    description: 'Blutdepot: Bestand an Erythrozyten-, Thrombozytenkonzentraten und Plasma je Blutgruppe, Transfusionen, abgesetzte OPs',
    inputs: ['time'],
    tokens: { blood_group: '*' },
    dataSources: {
        ds_inv: search(INV, { name: 'Bestand je Produkt und Blutgruppe' }),
        ds_k_ek: chain('ds_inv', '| where product="EK" | stats sum(units_available) as "EK gesamt"'),
        ds_k_crit: chain('ds_inv', '| where status="kritisch" | stats count as Kritisch'),
        ds_k_low: chain('ds_inv', '| where status="niedrig" | stats count as Niedrig'),
        ds_k_exp: chain('ds_inv', '| stats sum(expiring_48h) as "Verfall 48 h"'),
        ds_k_trans: search(`${IDX} sourcetype="sakh:bloodbank:transfusion" | timechart span=1h count as Ausgaben`),
        ds_k_denied: search(`${IDX} sourcetype="sakh:bloodbank:transfusion" status="Ausgabe abgelehnt*" | stats count as Abgelehnt`),
        ds_ek_trend: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.blood.units_available" product="EK" blood_group="$blood_group$" BY blood_group span=10m
| timechart span=10m avg(v) by blood_group`, { name: 'EK-Bestand je Blutgruppe' }),
        ds_fill: search(`| mstats avg(_value) as value WHERE ${MIDX} metric_name="sakh.blood.fill_pct" BY product blood_group span=30m
| eval series=product." ".blood_group | timechart span=30m limit=0 avg(value) by series`),
        ds_days: chain('ds_inv', `| eval Status=status | sort product days_of_supply
| table product blood_group units_available units_reserved min_stock target_stock days_of_supply expiring_48h Status
| rename product as Produkt blood_group as Blutgruppe units_available as Bestand units_reserved as Reserviert min_stock as Minimum target_stock as Soll days_of_supply as "Reichweite (Tage)" expiring_48h as "Verfall 48 h"`),
        ds_trans_dept: search(`${IDX} sourcetype="sakh:bloodbank:transfusion" blood_group="$blood_group$" | chart count over department by product`),
        ds_trans: search(`${IDX} sourcetype="sakh:bloodbank:transfusion" blood_group="$blood_group$"
| eval Zeit=strftime(_time, "%d.%m. %H:%M") | table Zeit unit_id product blood_group units department ward indication status
| rename unit_id as Konserve product as Produkt blood_group as Blutgruppe units as Einheiten department as Abteilung ward as Station indication as Indikation status as Status | head 50`),
        ds_or_cancel: search(`${IDX} sourcetype="sakh:or:case" type=plan status="abgesetzt*"
| stats latest(procedure) as Eingriff latest(department) as Abteilung latest(blood_units_planned) as EK latest(planned_start) as ps by room case_id
| eval Geplant=strftime(ps, "%d.%m. %H:%M") | table Geplant room Eingriff Abteilung EK | rename room as Saal EK as "EK geplant"`),
    },
    rows: [
        {
            section: 'Reserven',
            h: 150,
            panels: [
                { cols: 2, title: 'EK gesamt', hint: 'Soll 935', viz: kpi('ds_k_ek', { decimals: 0, spark: false, warn: 600, crit: 400 }) },
                { cols: 2, title: 'Kritische Bestaende', viz: kpi('ds_k_crit', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'Unter Mindestbestand', viz: kpi('ds_k_low', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'Verfall in 48 h', viz: kpi('ds_k_exp', { decimals: 0, spark: false, color: '#c98a00' }) },
                { cols: 2, title: 'Ausgaben je Stunde', viz: kpi('ds_k_trans', { decimals: 0, color: '#c8253f' }) },
                { cols: 2, title: 'Ausgabe abgelehnt', viz: kpi('ds_k_denied', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
            ],
        },
        {
            section: 'Bestand',
            h: 470,
            panels: [
                {
                    cols: 12,
                    title: 'Blutkonserven je Produkt und Blutgruppe',
                    hint: 'Strichlinie = Mindestbestand; darunter niedrig, unter dem halben Minimum kritisch. Klick filtert Verlauf und Transfusionen',
                    viz: custom('blood_bank', 'ds_inv', { drilldownToken: 'blood_group' }, [setToken('blood_group')]),
                },
            ],
        },
        {
            h: 360,
            panels: [
                { cols: 6, title: 'EK-Bestand (Einheiten)', viz: line('ds_ek_trend') },
                { cols: 6, title: 'Fuellstand je Produkt und Gruppe (%)', viz: custom('heat_timeline', 'ds_fill', { scaleMode: 'thresholds', higherIsBetter: true, warn: 45, crit: 25, unit: '%', maxSeries: 24, decimals: 0 }) },
            ],
        },
        {
            h: 440,
            panels: [
                { cols: 7, title: 'Reichweite', hint: 'gelb unter 3 Tagen, rot unter 1,5 Tagen', viz: table('ds_days', { count: 12, status: ['Status'], ranges: { 'Reichweite (Tage)': { warn: 3, crit: 1.5 } } }) },
                { cols: 5, title: 'Transfusionen je Abteilung', viz: bar('ds_trans_dept', { stack: 'stacked', legend: 'bottom' }) },
            ],
        },
        {
            h: 400,
            panels: [
                { cols: 7, title: 'Ausgaben und Transfusionen', viz: table('ds_trans', { count: 10, status: ['Status'] }) },
                { cols: 5, title: 'Abgesetzte OPs (Blutbedarf)', viz: table('ds_or_cancel', { count: 10 }) },
            ],
        },
    ],
};
