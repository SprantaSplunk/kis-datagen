import { bar, chain, column, custom, kpi, line, pie, search, setToken, table } from '../lib/studio.mjs';
import { IDX, none } from '../lib/spl.mjs';

const LIS = `${IDX} sourcetype="sakh:lis:result" department="$dept$"`;
const RIS = `${IDX} sourcetype="sakh:ris:order" department="$dept$"`;
const ACK = `${IDX} sourcetype="sakh:lis:critical" department="$dept$"`;

// one row per critical result with its notification state; the last 4 h cover the 3 h acknowledgement window
const CRITICAL_STATE = (range) => `${IDX} department="$dept$" ${range}((sourcetype="sakh:lis:result" (flag="HH" OR flag="LL")) OR sourcetype="sakh:lis:critical")
| eventstats min(eval(if(sourcetype="sakh:lis:critical", _time, null()))) as ack_start
| eval rt=if(sourcetype="sakh:lis:result", _time, null()), acked=if(action="quittiert", minutes, null()), ack_role=if(action="quittiert", role, null()), told=if(action="mitgeteilt", 1, null()), esc=if(action="eskaliert", escalation_level, null()), why=if(action="eskaliert", reason, null())
| stats min(rt) as rt max(acked) as ack_min first(ack_role) as ack_role max(told) as told max(esc) as escalated first(why) as reason first(test_code) as test_code first(test_name) as test_name first(value) as value first(unit) as unit first(ref_low) as ref_low first(ref_high) as ref_high first(crit_low) as crit_low first(crit_high) as crit_high first(flag) as flag first(ward) as ward first(priority) as priority first(delivery_status) as delivery_status first(patient_id) as patient_id first(ack_start) as ack_start by order_id
| where isnotnull(rt)
| eval ack_state=case(isnotnull(ack_min), "quittiert", rt>=ack_start, "offen", true(), "unbekannt")`;

export default {
    id: 'kis_lab',
    navLabel: 'Labor & Radiologie',
    domain: 'diag',
    title: 'Labor und Radiologie',
    subtitle: 'Befunde, kritische Werte, Durchlaufzeiten, Zustellung ins KIS, Radiologie-Auftraege und PACS',
    description: 'LIS-Befunde mit TAT und KIS-Zustellung, RIS-Auftraege je Modalitaet und DICOM-Speicherungen im PACS',
    inputs: ['time', 'dept'],
    tokens: { lab_test: '*' },
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
        ds_crit: search(`${CRITICAL_STATE('')}
| eval _time=rt | sort - _time | head 300
| table _time test_code test_name value unit ref_low ref_high crit_low crit_high flag ward priority delivery_status patient_id ack_state ack_min ack_role escalated reason`, { name: 'Kritische Befunde mit Quittierung' }),
        ds_open: search(`${CRITICAL_STATE('earliest=-4h latest=now ')}
| where ack_state="offen" | eval age=round((now() - rt) / 60, 0)`, { name: 'Offene kritische Befunde' }),
        ds_k_open: chain('ds_open', '| stats count as "Nicht quittiert"'),
        ds_k_overdue: chain('ds_open', '| where age>30 | stats count as "Ueber 30 min"'),
        ds_open_table: chain('ds_open', `| sort - age
| eval Status=case(escalated>=2, "2. Eskalation: OA vom Dienst", escalated=1, "eskaliert an Oberarzt", told=1, "telefonisch mitgeteilt", true(), "noch nicht mitgeteilt"), Wert=value." ".unit, Richtung=if(flag="HH", "zu hoch", "zu niedrig")
| table ward age test_name Wert Status reason delivery_status
| rename ward as Station age as "Seit (min)" test_name as Test reason as Grund delivery_status as KIS
${none('Station', 'Alle kritischen Werte sind quittiert')}`),
        ds_ack: search(ACK, { name: 'Meldung kritischer Werte' }),
        ds_k_ack_med: chain('ds_ack', '| where action="quittiert" | timechart span=1h median(minutes) as "Median"'),
        ds_k_ack_30: chain('ds_ack', '| where action="quittiert" | eval ok=if(minutes<=30, 100, 0) | timechart span=1h avg(ok) as "Innerhalb 30 min"'),
        ds_ack_buckets: chain('ds_ack', `| where action="quittiert"
| eval Dauer=case(minutes<=10, "bis 10 min", minutes<=30, "10 bis 30 min", true(), "ueber 30 min (eskaliert)")
| timechart span=1h count by Dauer`),
        ds_crit_ward: chain('ds_lis', `| search (flag="HH" OR flag="LL") test_code="$lab_test$"
| eval Richtung=if(flag="HH", "zu hoch", "zu niedrig")
| chart count over ward by Richtung | rename ward as Station
${none('Station', 'Keine kritischen Werte im Zeitraum')}`),
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
                { cols: 2, title: 'Befunde', viz: kpi('ds_k_results', { decimals: 0, color: '#b8457c' }) },
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
                { cols: 4, title: 'Zustellung ins KIS', hint: 'in Warteschlange = Kommunikationsserver', viz: column('ds_delivery', { stack: 'stacked', colors: ['#c8253f', '#1e8a5a'] }) },
            ],
        },
        {
            section: 'Meldung kritischer Werte',
            h: 150,
            panels: [
                { cols: 3, title: 'Kritisch, nicht quittiert', hint: 'jetzt', viz: kpi('ds_k_open', { decimals: 0, spark: false, warn: 3, crit: 6, higher: false }) },
                { cols: 3, title: 'Davon ueber 30 min', hint: 'eskaliert an Oberarzt', viz: kpi('ds_k_overdue', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 3, title: 'Zeit bis Quittierung (Median)', viz: kpi('ds_k_ack_med', { unit: 'min', decimals: 0, warn: 15, crit: 30, higher: false }) },
                { cols: 3, title: 'Quittiert innerhalb 30 min', hint: 'Ziel 90 %', viz: kpi('ds_k_ack_30', { unit: '%', decimals: 0, warn: 90, crit: 80 }) },
            ],
        },
        {
            h: 340,
            panels: [
                { cols: 6, title: 'Offene kritische Befunde', hint: 'Labor ruft an, nach 30 min Eskalation', viz: table('ds_open_table', { count: 7, status: ['Status', 'KIS'], ranges: { 'Seit (min)': { warn: 15, crit: 30, higher: false } } }) },
                { cols: 6, title: 'Zeit bis Quittierung', hint: 'Befunde je Stunde', viz: column('ds_ack_buckets', { stack: 'stacked', extra: { seriesColorsByField: { 'bis 10 min': '#13804f', '10 bis 30 min': '#d99a1e', 'ueber 30 min (eskaliert)': '#c8102e' } } }) },
            ],
        },
        {
            h: 420,
            panels: [
                {
                    cols: 8,
                    title: 'Kritische Werte je Test',
                    hint: 'gruen Referenz, rot jenseits Alarmgrenze · Ring = noch nicht im KIS · Halo = nicht quittiert · Klick filtert die Stationen',
                    viz: custom('lab_critical', 'ds_crit', { drilldownToken: 'lab_test' }, [setToken('lab_test')]),
                },
                { cols: 4, title: 'Kritische Werte je Station', hint: 'gewaehlter Test oder alle', viz: bar('ds_crit_ward', { stack: 'stacked', legend: 'bottom', extra: { seriesColorsByField: { 'zu hoch': '#c8102e', 'zu niedrig': '#006d9c' } } }) },
            ],
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
