import { chain, column, kpi, line, search, table } from '../lib/studio.mjs';
import { IDX, IOS_REX } from '../lib/spl.mjs';

export default {
    id: 'kis_security',
    navLabel: 'Sicherheit',
    domain: 'security',
    title: 'Sicherheit und Datenschutz',
    subtitle: 'Notfallzugriffe (Break-the-Glass), Anmeldefehler, Kontosperren, Netzwerk-Zugriffe und PSIRT-Lage',
    description: 'Sicherheitslage: KIS-Zugriffsprotokoll, Windows-Anmeldungen, ISE, Logins auf Netzwerkgeraeten und betroffene Cisco-Geraete',
    inputs: ['time', 'dept'],
    dataSources: {
        ds_audit: search(`${IDX} sourcetype="sakh:kis:audit" department="$dept$"`, { name: 'KIS-Audit' }),
        ds_k_btg: chain('ds_audit', '| where break_the_glass="true" OR break_the_glass=1 | timechart span=1h count as "Break-the-Glass"'),
        ds_k_fail: chain('ds_audit', '| where result="Fehlgeschlagen" | timechart span=1h count as "KIS-Logins fehlgeschlagen"'),
        ds_k_win: search(`${IDX} sourcetype="WinEventLog" EventCode=4625 | timechart span=1h count as "Windows 4625"`),
        ds_k_lock: search(`${IDX} sourcetype="WinEventLog" EventCode=4740 | stats count as Kontosperren`),
        ds_k_net: search(`${IDX} sourcetype="cisco:ios" "LOGIN_SUCCESS" NOT "Source: 10." | stats count as "Externe Geraete-Logins"`),
        ds_k_psirt: search(`${IDX} sourcetype="cisco:iq:advisory" severity="Critical" earliest=-7h | stats dc(hostname) as "PSIRT kritisch"`),
        ds_btg: chain('ds_audit', `| where break_the_glass="true" OR break_the_glass=1
| eval Zeit=strftime(_time, "%d.%m. %H:%M") | table Zeit user role department ward workstation patient_id btg_reason
| rename user as Benutzer role as Rolle department as Abteilung ward as Station workstation as Arbeitsplatz patient_id as Patient btg_reason as Begruendung`),
        ds_logins: chain('ds_audit', '| where action="Login" | timechart span=30m count by result'),
        ds_win: search(`${IDX} sourcetype="WinEventLog" (EventCode=4625 OR EventCode=4740 OR EventCode=4672)
| rex "Account Name:\\\\s+(?<account>\\\\S+)" | rex "Source Network Address:\\\\s+(?<src>\\\\S+)"
| stats count as Anzahl latest(_time) as t by EventCode account src ComputerName
| eval Zeit=strftime(t, "%d.%m. %H:%M"), Ereignis=case(EventCode=4625, "Anmeldung fehlgeschlagen", EventCode=4740, "Konto gesperrt", true(), "Privilegierte Anmeldung")
| sort - Anzahl | head 25 | table Zeit Ereignis account src ComputerName Anzahl | rename account as Konto src as Quelle ComputerName as Server`),
        ds_netlogin: search(`${IDX} sourcetype="cisco:ios" ("LOGIN_SUCCESS" OR "CONFIG_P" OR "WEBUI") ${IOS_REX}
| rex "\\\\[user: (?<user>[^\\\\]]+)\\\\] \\\\[Source: (?<src>[^\\\\]]+)\\\\]"
| eval Zeit=strftime(_time, "%d.%m. %H:%M:%S"), Bewertung=if(isnotnull(src) AND NOT cidrmatch("10.0.0.0/8", src), "verdaechtig", "intern")
| table Zeit device mnemonic user src Bewertung message_text | rename device as Geraet user as Benutzer src as Quelle message_text as Meldung | head 30`),
        ds_ssh: search(`${IDX} sourcetype="syslog" "Failed password" | rex "from (?<src>\\\\S+) port" | timechart span=1h count by host`),
        ds_psirt: search(`${IDX} sourcetype="cisco:iq:advisory" earliest=-7h | stats dc(hostname) as Geraete by severity advisoryId | sort severity | rename severity as Schwere advisoryId as Advisory`),
        ds_inc: search(`${IDX} sourcetype="snow:incident" category="Security" | stats latest(state) as Status latest(priority_label) as Prioritaet latest(short_description) as Beschreibung latest(opened_at) as Eroeffnet by number | rename number as Incident`),
    },
    rows: [
        {
            section: 'Lage',
            h: 150,
            panels: [
                { cols: 2, title: 'Break-the-Glass', viz: kpi('ds_k_btg', { decimals: 0, warn: 3, crit: 8, higher: false }) },
                { cols: 2, title: 'KIS-Logins fehlgeschlagen', viz: kpi('ds_k_fail', { decimals: 0, warn: 20, crit: 50, higher: false }) },
                { cols: 2, title: 'Windows Anmeldefehler', viz: kpi('ds_k_win', { decimals: 0, warn: 30, crit: 80, higher: false }) },
                { cols: 2, title: 'Kontosperren', viz: kpi('ds_k_lock', { decimals: 0, spark: false, warn: 2, crit: 5, higher: false }) },
                { cols: 2, title: 'Externe Geraete-Logins', viz: kpi('ds_k_net', { decimals: 0, spark: false, warn: 1, crit: 1, higher: false }) },
                { cols: 2, title: 'PSIRT kritisch betroffen', viz: kpi('ds_k_psirt', { decimals: 0, spark: false, warn: 1, crit: 1, higher: false }) },
            ],
        },
        {
            section: 'KIS-Zugriffe',
            h: 400,
            panels: [
                { cols: 7, title: 'Break-the-Glass-Zugriffe', hint: 'Notfallzugriff auf Akten fremder Stationen – Begruendung pruefen', viz: table('ds_btg', { count: 10 }) },
                { cols: 5, title: 'KIS-Logins', viz: column('ds_logins', { stack: 'stacked', colors: ['#34e2a0', '#ff4d6d'] }) },
            ],
        },
        {
            section: 'Infrastruktur',
            h: 400,
            panels: [
                { cols: 6, title: 'Windows-Sicherheitsereignisse', viz: table('ds_win', { count: 10 }) },
                { cols: 6, title: 'Logins und Konfiguration auf Netzwerkgeraeten', viz: table('ds_netlogin', { count: 10, status: ['Bewertung'] }) },
            ],
        },
        {
            h: 340,
            panels: [
                { cols: 4, title: 'SSH-Fehlversuche (Linux)', viz: line('ds_ssh', { legend: 'off' }) },
                { cols: 4, title: 'Cisco PSIRT (Cisco IQ)', viz: table('ds_psirt', { count: 6, status: ['Schwere'] }) },
                { cols: 4, title: 'Security-Incidents', viz: table('ds_inc', { count: 6, status: ['Status'] }) },
            ],
        },
    ],
};
