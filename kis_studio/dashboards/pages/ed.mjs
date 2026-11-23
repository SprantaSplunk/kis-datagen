import { bar, chain, column, custom, kpi, line, pie, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const STATUS = `${IDX} sourcetype="sakh:ed:tracking" type=status`;
const ARRIVALS = `${IDX} sourcetype="sakh:ed:tracking" type=arrival triage_level="$triage$"`;

export default {
    id: 'kis_ed',
    navLabel: 'Notaufnahme',
    domain: 'care',
    title: 'Zentrale Notaufnahme',
    subtitle: 'Manchester-Triage, Wartezeiten, Boarding und Rettungsstopp – Klick auf eine Triage-Stufe filtert die Zugaenge',
    description: 'Notaufnahme: wartende Patientinnen und Patienten je Triage-Stufe, Wartezeiten, Zugaenge und Boarding',
    inputs: ['time'],
    tokens: { triage: '*' },
    dataSources: {
        ds_status: search(`${STATUS} | head 1`, { name: 'Letzter Board-Status' }),
        ds_flow: chain('ds_status', `| eval r=mvappend("1;".waiting_t1.";".longest_t1, "2;".waiting_t2.";".longest_t2, "3;".waiting_t3.";".longest_t3, "4;".waiting_t4.";".longest_t4, "5;".waiting_t5.";".longest_t5)
| mvexpand r
| eval f=split(r, ";"), triage_level=mvindex(f, 0), waiting=mvindex(f, 1), longest_wait_min=mvindex(f, 2)
| table triage_level waiting longest_wait_min`),
        ds_k_status: chain('ds_status', '| table status | rename status as Status'),
        ds_m: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.ed.waiting", "sakh.ed.boarding", "sakh.ed.longest_wait_min", "sakh.ed.door_to_doc_min", "sakh.ed.arrivals_per_hour") BY metric_name span=10m`, { name: 'Notaufnahme-Metriken' }),
        ds_k_wait: chain('ds_m', '| where metric_name="sakh.ed.waiting" | timechart span=10m avg(v) as Wartend'),
        ds_k_board: chain('ds_m', '| where metric_name="sakh.ed.boarding" | timechart span=10m avg(v) as Boarding'),
        ds_k_long: chain('ds_m', '| where metric_name="sakh.ed.longest_wait_min" | timechart span=10m avg(v) as "Laengste Wartezeit"'),
        ds_k_d2d: chain('ds_m', '| where metric_name="sakh.ed.door_to_doc_min" | timechart span=10m avg(v) as "Door-to-Doc"'),
        ds_k_arr: chain('ds_m', '| where metric_name="sakh.ed.arrivals_per_hour" | timechart span=10m avg(v) as "Zugaenge/h"'),
        ds_trend: chain('ds_m', `| where metric_name IN ("sakh.ed.waiting", "sakh.ed.boarding")
| eval series=if(metric_name="sakh.ed.waiting", "Wartend", "Boarding (wartet auf Station)")
| timechart span=10m avg(v) by series`),
        ds_arrivals: search(`${ARRIVALS} | eval Stufe=triage_level." ".triage_label | timechart span=30m count by Stufe`, { name: 'Zugaenge je Triage-Stufe' }),
        ds_complaints: search(`${ARRIVALS} | stats count as Zugaenge by complaint | sort - Zugaenge | head 10 | rename complaint as Leitsymptom`),
        ds_mode: search(`${ARRIVALS} | stats count by arrival_mode`),
        ds_target: search(`${ARRIVALS} | stats count as Zugaenge by target_department | sort - Zugaenge | rename target_department as Fachabteilung`),
        ds_last: search(`${ARRIVALS}
| eval Zeit=strftime(_time, "%H:%M"), Triage=triage_level." ".triage_color
| table Zeit Triage complaint target_department arrival_mode age sex
| rename complaint as Leitsymptom target_department as Fachabteilung arrival_mode as Ankunft age as Alter sex as Geschlecht
| head 50`),
    },
    rows: [
        {
            section: 'Board',
            h: 150,
            panels: [
                { cols: 2, title: 'Wartend', viz: kpi('ds_k_wait', { decimals: 0, warn: 15, crit: 30, higher: false }) },
                { cols: 2, title: 'Laengste Wartezeit (min)', viz: kpi('ds_k_long', { decimals: 0, warn: 90, crit: 150, higher: false }) },
                { cols: 2, title: 'Door-to-Doc (min)', viz: kpi('ds_k_d2d', { decimals: 0, warn: 30, crit: 60, higher: false }) },
                { cols: 2, title: 'Boarding', viz: kpi('ds_k_board', { decimals: 0, warn: 6, crit: 12, higher: false }) },
                { cols: 2, title: 'Zugaenge pro Stunde', viz: kpi('ds_k_arr', { decimals: 1, color: '#22d3ee' }) },
                { cols: 2, title: 'Status', viz: table('ds_k_status', { count: 1, status: ['Status'] }) },
            ],
        },
        {
            section: 'Triage',
            h: 380,
            panels: [
                {
                    cols: 7,
                    title: 'Wartende je Manchester-Triage-Stufe',
                    hint: 'Klick filtert die Zugaenge unten',
                    viz: custom('ed_flow', 'ds_flow', { drilldownToken: 'triage' }, [setToken('triage')]),
                },
                { cols: 5, title: 'Wartend und Boarding', viz: line('ds_trend') },
            ],
        },
        {
            section: 'Zugaenge (Filter per Klick auf eine Triage-Stufe)',
            h: 340,
            panels: [
                { cols: 6, title: 'Zugaenge je Triage-Stufe', viz: column('ds_arrivals', { stack: 'stacked', colors: ['#e5203a', '#f97316', '#facc15', '#22c55e', '#3b82f6'] }) },
                { cols: 3, title: 'Leitsymptome', viz: bar('ds_complaints') },
                { cols: 3, title: 'Ankunftsart', viz: pie('ds_mode') },
            ],
        },
        {
            h: 420,
            panels: [
                { cols: 4, title: 'Weiterbehandlung in', viz: bar('ds_target') },
                { cols: 8, title: 'Letzte Zugaenge', viz: table('ds_last', { count: 12 }) },
            ],
        },
    ],
};
