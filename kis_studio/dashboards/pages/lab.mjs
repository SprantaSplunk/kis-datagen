import { bar, chain, column, kpi, line, pie, search, table } from '../lib/studio.mjs';
import { IDX, none } from '../lib/spl.mjs';

const LIS = `${IDX} sourcetype="sakh:lis:result" department="$dept$"`;
const RIS = `${IDX} sourcetype="sakh:ris:order" department="$dept$"`;

export default {
    id: 'kis_lab',
    navLabel: 'Labor & Radiologie',
    domain: 'diag',
    title: 'Labor und Radiologie',
    subtitle: 'Befunde, kritische Werte, Durchlaufzeiten, Zustellung ins KIS, Radiologie-Auftraege und PACS',
    description: 'LIS-Befunde mit TAT und KIS-Zustellung, RIS-Auftraege je Modalitaet und DICOM-Speicherungen im PACS',
    inputs: ['time', 'dept'],
    dataSources: {
        ds_lis: search(LIS, { name: 'Laborbefunde' }),
        ds_k_results: chain('ds_lis', '| timechart span=30m count as Befunde'),
        ds_k_crit: chain('ds_lis', '| eval c=if(critical="true" OR critical="1", 1, 0) | timechart span=30m sum(c) as "Kritische Werte"'),
        ds_k_tat: chain('ds_lis', '| where priority="Notfall" | timechart span=30m avg(tat_min) as "TAT Notfall"'),
        ds_k_undeliv: chain('ds_lis', '| eval u=if(delivered_to_kis="false" OR delivered_to_kis="0", 1, 0) | timechart span=10m sum(u) as "Nicht im KIS"'),
        ds_k_flu: chain('ds_lis', '| where test_code="INFLU" | stats count(eval(value="positiv")) as pos count as n | eval "Influenza positiv %"=if(n>0, round(100 * pos / n, 1), 0) | fields "Influenza positiv %"'),
        ds_cat: chain('ds_lis', '| timechart span=30m count by category'),
        ds_tat: chain('ds_lis', '| where category!="Mikrobiologie" | timechart span=30m avg(tat_min) by priority'),
        ds_delivery: chain('ds_lis', '| timechart span=10m count by delivery_status'),
        ds_crit_table: chain('ds_lis', `| where flag="HH" OR flag="LL"
| eval Zeit=strftime(_time, "%H:%M"), Wert=value." ".unit
| table Zeit ward test_name Wert flag priority delivery_status
| rename ward as Station test_name as Test flag as Flag priority as Prioritaet delivery_status as Zustellung | head 40
${none('Zeit', 'Keine kritischen Werte im Zeitraum')}`),
        ds_ris: search(RIS, { name: 'RIS-Auftraege' }),
        ds_modality: chain('ds_ris', '| chart count over modality by status'),
        ds_wait: chain('ds_ris', '| where priority="Routine" | stats avg(wait_days) as "Wartezeit (Tage)" by modality | eval "Wartezeit (Tage)"=round(\'Wartezeit (Tage)\', 1)'),
        ds_moved: chain('ds_ris', `| where status="umgeplant"
| eval Zeit=strftime(_time, "%H:%M") | table Zeit order_id exam original_device device_id reason wait_days
| rename order_id as Auftrag exam as Untersuchung original_device as "Geplant auf" device_id as "Neu auf" reason as Grund wait_days as "Wartezeit (Tage)"
${none('Zeit', 'Keine umgeplanten Untersuchungen im Zeitraum')}`),
        ds_pacs: search(`${IDX} sourcetype="sakh:pacs:dicom" | timechart span=30m sum(size_mb) as MB by modality`, { name: 'PACS Datenvolumen' }),
        ds_pacs_fail: search(`${IDX} sourcetype="sakh:pacs:dicom" status!="Success" | stats count as Fehler by device_id status | rename device_id as Modalitaet status as Fehlerbild ${none('Modalitaet', 'Keine Speicherfehler im Zeitraum')}`),
        ds_device: chain('ds_ris', '| stats count by device_id | sort - count | head 12'),
    },
    rows: [
        {
            section: 'Labor (LIS)',
            h: 150,
            panels: [
                { cols: 2, title: 'Befunde', viz: kpi('ds_k_results', { decimals: 0, color: '#f472b6' }) },
                { cols: 2, title: 'Kritische Werte', viz: kpi('ds_k_crit', { decimals: 0, warn: 5, crit: 10, higher: false }) },
                { cols: 3, title: 'TAT Notfall (min)', viz: kpi('ds_k_tat', { decimals: 0, warn: 45, crit: 60, higher: false }) },
                { cols: 3, title: 'Befunde nicht im KIS', viz: kpi('ds_k_undeliv', { decimals: 0, warn: 1, crit: 10, higher: false }) },
                { cols: 2, title: 'Influenza positiv', viz: kpi('ds_k_flu', { unit: '%', spark: false, warn: 20, crit: 40, higher: false }) },
            ],
        },
        {
            h: 340,
            panels: [
                { cols: 4, title: 'Befunde je Fachbereich', viz: column('ds_cat', { stack: 'stacked' }) },
                { cols: 4, title: 'Durchlaufzeit je Prioritaet (min)', viz: line('ds_tat') },
                { cols: 4, title: 'Zustellung ins KIS', hint: 'in Warteschlange = Kommunikationsserver', viz: column('ds_delivery', { stack: 'stacked', colors: ['#ff4d6d', '#34e2a0'] }) },
            ],
        },
        {
            h: 380,
            panels: [{ cols: 12, title: 'Kritische Werte', viz: table('ds_crit_table', { count: 10, status: ['Zustellung'] }) }],
        },
        {
            section: 'Radiologie (RIS / PACS)',
            h: 340,
            panels: [
                { cols: 4, title: 'Auftraege je Modalitaet und Status', viz: bar('ds_modality', { stack: 'stacked', legend: 'bottom' }) },
                { cols: 3, title: 'Wartezeit Routine (Tage)', viz: column('ds_wait', { legend: 'off' }) },
                { cols: 5, title: 'PACS Datenvolumen (MB)', viz: column('ds_pacs', { stack: 'stacked' }) },
            ],
        },
        {
            h: 360,
            panels: [
                { cols: 6, title: 'Umgeplante Untersuchungen', viz: table('ds_moved', { count: 8 }) },
                { cols: 3, title: 'Auftraege je Geraet', viz: pie('ds_device') },
                { cols: 3, title: 'PACS Speicherfehler', viz: table('ds_pacs_fail', { count: 8 }) },
            ],
        },
    ],
};
