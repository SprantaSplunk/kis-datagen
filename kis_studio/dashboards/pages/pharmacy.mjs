import { bar, chain, column, custom, kpi, search, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const STOCK = `${IDX} sourcetype="sakh:pharmacy" type=stock earliest=-60m
| stats latest(on_hand) as on_hand latest(reorder_point) as reorder_point latest(daily_usage) as daily_usage latest(days_of_supply) as days_of_supply latest(basg_shortage) as basg_shortage latest(status) as status latest(controlled) as controlled by atc drug`;
const STAFF = `${IDX} sourcetype="sakh:nursing:staffing" department="$dept$" earliest=-35m
| stats latest(shift) as shift latest(nurses_planned) as planned latest(nurses_present) as present latest(sick_leave) as sick latest(leasing) as leasing latest(patients) as patients latest(patients_per_nurse) as ratio latest(status) as status by ward department building`;

export default {
    id: 'kis_pharmacy',
    navLabel: 'Apotheke & Pflege',
    domain: 'diag',
    title: 'Apotheke und Pflege',
    subtitle: 'Arzneimittelbestand, Lieferengpaesse (BASG), Stationsausgaben, Pflegepersonal und Lichtruf',
    description: 'Krankenhausapotheke, Lieferengpaesse, Pflegepersonalbesetzung je Station und Lichtruf-Reaktionszeiten',
    inputs: ['time', 'dept'],
    dataSources: {
        ds_stock: search(STOCK, { name: 'Arzneimittelbestand' }),
        ds_k_crit: chain('ds_stock', '| where status="kritisch" | stats count as Kritisch'),
        ds_k_short: chain('ds_stock', '| where basg_shortage="true" OR basg_shortage=1 | stats count as Lieferengpass'),
        ds_stock_table: chain('ds_stock', `| eval Engpass=if(basg_shortage="true" OR basg_shortage=1, "BASG-Meldung", ""), BtM=if(controlled="true" OR controlled=1, "ja", "")
| sort days_of_supply | table drug atc on_hand reorder_point daily_usage days_of_supply Engpass BtM status
| rename drug as Arzneimittel atc as ATC on_hand as Bestand reorder_point as Meldebestand daily_usage as "Verbrauch/Tag" days_of_supply as "Reichweite (Tage)" status as Status`),
        ds_dispense: search(`${IDX} sourcetype="sakh:pharmacy" type=dispense department="$dept$" | timechart span=1h sum(quantity) as Packungen by order_type`, { name: 'Ausgaben' }),
        ds_top: search(`${IDX} sourcetype="sakh:pharmacy" type=dispense department="$dept$" | stats sum(quantity) as Packungen by drug | sort - Packungen | head 10 | rename drug as Arzneimittel`),
        ds_staff: search(STAFF, { name: 'Pflegebesetzung' }),
        ds_k_under: chain('ds_staff', '| where status="unterbesetzt" | stats count as Unterbesetzt'),
        ds_k_present: chain('ds_staff', '| stats sum(present) as "Pflegekraefte im Dienst"'),
        ds_k_sick: chain('ds_staff', '| stats sum(sick) as Krankenstand'),
        ds_k_ratio: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.nursing.patients_per_nurse" department="$dept$" span=30m | rename v as "Patienten je Pflegekraft"`),
        ds_staff_table: chain('ds_staff', `| sort - ratio | table ward department shift planned present sick leasing patients ratio status
| rename ward as Station department as Abteilung shift as Dienst planned as Soll present as Ist sick as Krank leasing as Leasing patients as Patienten ratio as "Pat./Pflegekraft" status as Status`),
        ds_ratio_heat: search(`| mstats avg(_value) as value WHERE ${MIDX} metric_name="sakh.nursing.patients_per_nurse" department="$dept$" BY ward span=30m
| timechart span=30m limit=0 avg(value) by ward`),
        ds_call: search(`${IDX} sourcetype="sakh:nursecall" department="$dept$" | stats avg(response_s) as "Reaktion (s)" count as Rufe by ward | eval "Reaktion (s)"=round(\'Reaktion (s)\', 0) | sort - "Reaktion (s)" | head 15 | rename ward as Station`),
        ds_call_type: search(`${IDX} sourcetype="sakh:nursecall" department="$dept$" | timechart span=1h count by call_type`),
    },
    rows: [
        {
            section: 'Apotheke',
            h: 150,
            panels: [
                { cols: 2, title: 'Kritische Bestaende', viz: kpi('ds_k_crit', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'Lieferengpaesse', viz: kpi('ds_k_short', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
                { cols: 2, title: 'Pflege im Dienst', viz: kpi('ds_k_present', { decimals: 0, spark: false, color: '#34e2a0' }) },
                { cols: 2, title: 'Krankenstand', viz: kpi('ds_k_sick', { decimals: 0, spark: false, warn: 15, crit: 30, higher: false }) },
                { cols: 2, title: 'Patienten je Pflegekraft', viz: kpi('ds_k_ratio', { decimals: 1, warn: 7, crit: 9, higher: false }) },
                { cols: 2, title: 'Unterbesetzte Stationen', viz: kpi('ds_k_under', { decimals: 0, spark: false, warn: 1, crit: 4, higher: false }) },
            ],
        },
        {
            h: 440,
            panels: [
                { cols: 7, title: 'Arzneimittelbestand', viz: table('ds_stock_table', { count: 12, status: ['Status'], ranges: { 'Reichweite (Tage)': { warn: 3, crit: 1.5 } } }) },
                { cols: 5, title: 'Meistausgegeben', viz: bar('ds_top') },
            ],
        },
        {
            h: 320,
            panels: [{ cols: 12, title: 'Ausgaben je Anforderungsart (Packungen)', viz: column('ds_dispense', { stack: 'stacked' }) }],
        },
        {
            section: 'Pflege',
            h: 380,
            panels: [
                { cols: 6, title: 'Patienten je Pflegekraft', viz: custom('heat_timeline', 'ds_ratio_heat', { scaleMode: 'thresholds', higherIsBetter: false, warn: 7, crit: 9, maxSeries: 40, decimals: 1 }) },
                { cols: 6, title: 'Besetzung aktueller Dienst', viz: table('ds_staff_table', { count: 10, status: ['Status'] }) },
            ],
        },
        {
            section: 'Lichtruf',
            h: 360,
            panels: [
                { cols: 5, title: 'Reaktionszeit je Station', viz: table('ds_call', { count: 10, ranges: { 'Reaktion (s)': { warn: 120, crit: 240, higher: false } } }) },
                { cols: 7, title: 'Rufe je Art', viz: column('ds_call_type', { stack: 'stacked' }) },
            ],
        },
    ],
};
