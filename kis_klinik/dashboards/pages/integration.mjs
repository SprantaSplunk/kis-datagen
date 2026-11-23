import { chain, column, custom, kpi, line, search, setToken, table } from '../lib/studio.mjs';
import { IDX, MIDX } from '../lib/spl.mjs';

const HL7 = `| mstats avg(_value) as v WHERE ${MIDX} metric_name IN ("sakh.hl7.messages_in", "sakh.hl7.queue_depth", "sakh.hl7.avg_latency_ms", "sakh.hl7.ack_errors") BY metric_name channel source_system target_system span=5m`;

export default {
    id: 'kis_integration',
    navLabel: 'HL7 & eHealth',
    domain: 'it',
    title: 'Schnittstellen und eHealth',
    subtitle: 'Kommunikationsserver (HL7 v2, CDA, FHIR), Warteschlangen je Kanal, ELGA, e-card, e-Medikation und e-Rezept',
    description: 'Kommunikationsserver-Kanaele mit Durchsatz, Warteschlange und Latenz sowie die Gesundheit der oesterreichischen eHealth-Dienste',
    inputs: ['time'],
    tokens: { channel: '*' },
    dataSources: {
        ds_hl7: search(HL7, { name: 'HL7-Metriken (5 min)' }),
        ds_flow: search(`${IDX} sourcetype="sakh:hl7:engine" earliest=-5m
| stats sum(messages_in) as messages latest(queue_depth) as queue_depth latest(avg_latency_ms) as avg_latency_ms latest(status) as status latest(message_type) as message_type by channel source_system target_system`, { name: 'Kanaele jetzt' }),
        ds_k_msgs: chain('ds_hl7', '| where metric_name="sakh.hl7.messages_in" | timechart span=5m sum(v) as "Nachrichten/min"'),
        ds_k_queue: chain('ds_hl7', '| where metric_name="sakh.hl7.queue_depth" | timechart span=5m sum(v) as Warteschlange'),
        ds_k_ack: chain('ds_hl7', '| where metric_name="sakh.hl7.ack_errors" | timechart span=5m sum(v) as "ACK-Fehler"'),
        ds_k_stopped: chain('ds_flow', '| where status="gestoppt" OR status="Stau" | stats count as "Gestoerte Kanaele"'),
        ds_k_elga: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.ehealth.error_pct" span=15m | rename v as "eHealth Fehler %"`),
        ds_k_ecs: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.ehealth.avg_response_ms" service="ecard_ecs" span=15m | rename v as "e-card ms"`),
        ds_queue: chain('ds_hl7', '| where metric_name="sakh.hl7.queue_depth" AND channel="$channel$" | timechart span=5m limit=0 max(v) by channel'),
        ds_latency: chain('ds_hl7', '| where metric_name="sakh.hl7.avg_latency_ms" AND channel="$channel$" | timechart span=5m limit=0 avg(v) by channel'),
        ds_heat: chain('ds_hl7', '| where metric_name="sakh.hl7.queue_depth" | timechart span=5m limit=0 max(v) by channel'),
        ds_table: chain('ds_flow', `| eval Status=status
| table channel source_system target_system message_type messages queue_depth avg_latency_ms Status
| rename channel as Kanal source_system as Quelle target_system as Ziel message_type as Nachricht messages as "Nachrichten (5 min)" queue_depth as Warteschlange avg_latency_ms as "Latenz ms"`),
        ds_eh: search(`${IDX} sourcetype="sakh:ehealth" type=service earliest=-15m
| stats latest(service_name) as Dienst latest(requests) as "Anfragen (5 min)" latest(error_pct) as "Fehler %" latest(avg_response_ms) as "Antwort ms" latest(status) as Status by service | fields - service`),
        ds_eh_rt: search(`| mstats avg(_value) as v WHERE ${MIDX} metric_name="sakh.ehealth.avg_response_ms" BY service_name span=15m | timechart span=15m avg(v) by service_name`),
        ds_docs: search(`${IDX} sourcetype="sakh:ehealth" type=document | timechart span=30m count by status`),
        ds_doc_type: search(`${IDX} sourcetype="sakh:ehealth" type=document | chart count over document_type by status`),
    },
    rows: [
        {
            section: 'Kommunikationsserver',
            h: 150,
            panels: [
                { cols: 2, title: 'Nachrichten pro Minute', viz: kpi('ds_k_msgs', { decimals: 0, color: '#0f8f84' }) },
                { cols: 2, title: 'Warteschlange gesamt', viz: kpi('ds_k_queue', { decimals: 0, warn: 50, crit: 200, higher: false }) },
                { cols: 2, title: 'Gestoerte Kanaele', viz: kpi('ds_k_stopped', { decimals: 0, spark: false, warn: 1, crit: 2, higher: false }) },
                { cols: 2, title: 'ACK-Fehler', viz: kpi('ds_k_ack', { decimals: 0, warn: 5, crit: 50, higher: false }) },
                { cols: 2, title: 'eHealth Fehlerquote', viz: kpi('ds_k_elga', { unit: '%', decimals: 2, warn: 2, crit: 5, higher: false }) },
                { cols: 2, title: 'e-card Antwortzeit', viz: kpi('ds_k_ecs', { unit: 'ms', decimals: 0, warn: 400, crit: 800, higher: false }) },
            ],
        },
        {
            h: 520,
            panels: [
                {
                    cols: 7,
                    title: 'Nachrichtenfluss',
                    hint: 'Klick auf eine Warteschlange waehlt den Kanal',
                    viz: custom('hl7_flow', 'ds_flow', { drilldownToken: 'channel' }, [setToken('channel')]),
                },
                { cols: 5, title: 'Warteschlange je Kanal', viz: custom('heat_timeline', 'ds_heat', { scaleMode: 'thresholds', higherIsBetter: false, warn: 50, crit: 200, maxSeries: 20, decimals: 0, drilldownToken: 'channel' }, [setToken('channel')]) },
            ],
        },
        {
            h: 340,
            panels: [
                { cols: 6, title: 'Warteschlange (gewaehlter Kanal)', viz: line('ds_queue') },
                { cols: 6, title: 'Latenz ms (gewaehlter Kanal)', viz: line('ds_latency') },
            ],
        },
        {
            h: 420,
            panels: [{ cols: 12, title: 'Kanaele', viz: table('ds_table', { count: 14, status: ['Status'], ranges: { Warteschlange: { warn: 50, crit: 200, higher: false } } }) }],
        },
        {
            section: 'eHealth (ELGA, e-card, e-Medikation, e-Rezept)',
            h: 360,
            panels: [
                { cols: 5, title: 'Dienste', viz: table('ds_eh', { count: 6, status: ['Status'], ranges: { 'Fehler %': { warn: 2, crit: 5, higher: false } } }) },
                { cols: 7, title: 'Antwortzeit je Dienst (ms)', viz: line('ds_eh_rt') },
            ],
        },
        {
            h: 320,
            panels: [
                { cols: 6, title: 'ELGA-Dokumente (ITI-41) je Status', viz: column('ds_docs', { stack: 'stacked', colors: ['#1e8a5a', '#c8253f', '#c98a00'] }) },
                { cols: 6, title: 'Dokumenttypen', viz: column('ds_doc_type', { stack: 'stacked', colors: ['#1e8a5a', '#c8253f', '#c98a00'] }) },
            ],
        },
    ],
};
