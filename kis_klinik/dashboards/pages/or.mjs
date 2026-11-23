import { chain, column, custom, kpi, search, setToken, table } from '../lib/studio.mjs';
import { IDX } from '../lib/spl.mjs';

const TODAY = `${IDX} sourcetype="sakh:or:case" (type=plan OR type=milestone) earliest=@d latest=+1d department="$dept$"
| stats latest(planned_start) as planned_start latest(planned_end) as planned_end min(actual_start) as actual_start max(actual_end) as actual_end latest(status) as status latest(procedure) as procedure latest(department) as department latest(delay_min) as delay_min by room case_id`;

export default {
    id: 'kis_or',
    navLabel: 'OP',
    domain: 'care',
    title: 'OP-Management',
    subtitle: 'Saalplan heute, Wechselzeiten, Verspaetungen und abgesetzte Eingriffe',
    description: 'OP-Management: Tagesplan aller OP-Saele, Status, Auslastung und abgesetzte Faelle',
    inputs: ['time', 'dept'],
    tokens: { room: '*' },
    dataSources: {
        ds_today: search(TODAY, { name: 'OP-Faelle heute' }),
        ds_k_cases: chain('ds_today', '| stats count as "Faelle heute"'),
        ds_k_done: chain('ds_today', '| where isnotnull(actual_end) | stats count as Abgeschlossen'),
        ds_k_cancel: chain('ds_today', '| where like(status, "abgesetzt%") | stats count as Abgesetzt'),
        ds_k_delay: chain('ds_today', '| where isnotnull(actual_start) | eval d=(actual_start - planned_start) / 60 | stats avg(d) as "Verspaetung (min)" | eval "Verspaetung (min)"=round(\'Verspaetung (min)\', 0)'),
        ds_rooms: search(`${IDX} sourcetype="sakh:or:case" type=room_status earliest=-10m
| stats latest(phase) as phase latest(procedure) as procedure latest(department) as department latest(delay_min) as delay_min latest(cases_done) as done latest(cases_today) as total latest(cases_cancelled) as cancelled latest(utilization_pct) as util by room suite`, { name: 'Saalstatus' }),
        ds_k_running: chain('ds_rooms', '| where phase="OP laeuft" OR phase="Einleitung" OR phase="Ausleitung" | stats count as "Saele in Betrieb"'),
        ds_k_util: chain('ds_rooms', '| stats avg(util) as Auslastung | eval Auslastung=round(Auslastung, 1)'),
        ds_room_table: chain('ds_rooms', `| eval Faelle=done." / ".total, Phase=phase
| table room suite Phase procedure department delay_min Faelle cancelled util
| rename room as Saal suite as Bereich procedure as Eingriff department as Abteilung delay_min as "Verspaetung (min)" cancelled as Abgesetzt util as "Auslastung %"`),
        ds_util: chain('ds_rooms', '| table room util | rename room as Saal util as "Auslastung %"'),
        ds_cancelled: search(`${IDX} sourcetype="sakh:or:case" type=plan status="abgesetzt*" earliest=@d latest=+1d
| stats latest(procedure) as Eingriff latest(department) as Abteilung latest(planned_start) as ps latest(blood_units_planned) as EK by room case_id
| eval Geplant=strftime(ps, "%H:%M") | table room case_id Eingriff Abteilung Geplant EK | rename room as Saal case_id as Fall EK as "EK geplant"`),
        ds_by_dept: chain('ds_today', '| stats count as Faelle by department | sort - Faelle | rename department as Abteilung'),
        ds_cases_room: search(`${TODAY} | search room="$room$"
| eval Geplant=strftime(planned_start, "%H:%M")."–".strftime(planned_end, "%H:%M"), Beginn=strftime(actual_start, "%H:%M"), Ende=strftime(actual_end, "%H:%M")
| sort planned_start | table room case_id procedure department Geplant Beginn Ende status
| rename room as Saal case_id as Fall procedure as Eingriff department as Abteilung status as Status`),
    },
    rows: [
        {
            section: 'Heute',
            h: 150,
            panels: [
                { cols: 2, title: 'Faelle heute', viz: kpi('ds_k_cases', { decimals: 0, spark: false, color: '#1e8a5a' }) },
                { cols: 2, title: 'Abgeschlossen', viz: kpi('ds_k_done', { decimals: 0, spark: false, color: '#0b7fab' }) },
                { cols: 2, title: 'Saele in Betrieb', viz: kpi('ds_k_running', { decimals: 0, spark: false, color: '#6b4fb3' }) },
                { cols: 2, title: 'Mittlere Verspaetung (min)', viz: kpi('ds_k_delay', { decimals: 0, spark: false, warn: 15, crit: 30, higher: false }) },
                { cols: 2, title: 'Auslastung', viz: kpi('ds_k_util', { unit: '%', spark: false, warn: 60, crit: 40 }) },
                { cols: 2, title: 'Abgesetzt', viz: kpi('ds_k_cancel', { decimals: 0, spark: false, warn: 1, crit: 3, higher: false }) },
            ],
        },
        {
            section: 'Saalplan',
            h: 520,
            panels: [
                {
                    cols: 12,
                    title: 'OP-Saele heute',
                    hint: 'Rahmen = geplant, Fuellung = tatsaechlich, durchgestrichen = abgesetzt. Klick auf einen Saal zeigt seine Faelle',
                    viz: custom('or_timeline', 'ds_today', { drillField: 'room', drilldownToken: 'room' }, [setToken('room')]),
                },
            ],
        },
        {
            h: 400,
            panels: [
                { cols: 8, title: 'Saalstatus', viz: table('ds_room_table', { count: 12, ranges: { 'Verspaetung (min)': { warn: 15, crit: 30, higher: false } } }) },
                { cols: 4, title: 'Auslastung je Saal (%)', viz: column('ds_util', { legend: 'off', yMax: 100 }) },
            ],
        },
        {
            h: 380,
            panels: [
                { cols: 5, title: 'Faelle des gewaehlten Saals', viz: table('ds_cases_room', { count: 8, status: ['Status'] }) },
                { cols: 4, title: 'Abgesetzte Eingriffe', viz: table('ds_cancelled', { count: 8 }) },
                { cols: 3, title: 'Faelle je Abteilung', viz: column('ds_by_dept', { legend: 'off' }) },
            ],
        },
    ],
};
