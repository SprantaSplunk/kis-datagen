import { bar, chain, kpi, pie, search, setToken, table } from '../lib/studio.mjs';
import { IDX } from '../lib/spl.mjs';

const ASSETS = `${IDX} sourcetype="cisco:iq:asset" building="$building$" earliest=-7h
| stats latest(productId) as productId latest(productFamily) as productFamily latest(softwareVersion) as softwareVersion latest(role) as role latest(building) as building latest(lifecycleStage) as lifecycleStage latest(lastDateOfSupport) as lastDateOfSupport latest(endOfSaleDate) as endOfSaleDate latest(coverageStatus) as coverageStatus latest(contractNumber) as contractNumber latest(serviceLevel) as serviceLevel latest(coverageEndDate) as coverageEndDate by hostname`;
const ADV = `${IDX} sourcetype="cisco:iq:advisory" building="$building$" earliest=-7h`;

export default {
    id: 'kis_ciscoiq',
    navLabel: 'Cisco IQ',
    domain: 'network',
    title: 'Cisco IQ – Assets, Lifecycle und Sicherheit',
    subtitle: 'Inventar, Security Advisories, Field Notices, End-of-Life und Servicevertraege aller Cisco-Geraete (synthetische Demo-Advisories)',
    description: 'Cisco IQ: Asset-Inventar, betroffene Geraete je PSIRT-Advisory, Lifecycle-Meilensteine, Vertragsabdeckung und Field Notices',
    inputs: ['time', 'building'],
    tokens: { advisory: '*' },
    dataSources: {
        ds_assets: search(ASSETS, { name: 'Cisco IQ Assets' }),
        ds_k_assets: chain('ds_assets', '| stats count as Assets'),
        ds_k_eos: chain('ds_assets', '| where lifecycleStage="End of Support" | stats count as "End of Support"'),
        ds_k_nocov: chain('ds_assets', '| where coverageStatus="Not Covered" | stats count as "Ohne Vertrag"'),
        ds_k_exp: chain('ds_assets', '| where coverageStatus="Expiring" | stats count as "Vertrag laeuft ab"'),
        ds_adv: search(ADV, { name: 'Advisories' }),
        ds_k_crit: chain('ds_adv', '| where severity="Critical" | stats dc(hostname) as "Kritisch betroffen"'),
        ds_k_fn: search(`${IDX} sourcetype="cisco:iq:fieldnotice" status="Potentially Vulnerable" earliest=-7h | stats dc(hostname) as "Field Notices"`),
        ds_adv_table: chain('ds_adv', `| stats latest(title) as Titel latest(severity) as Schwere max(cvssBaseScore) as CVSS dc(hostname) as Betroffen latest(fixedVersion) as "Fix in" values(cves{}) as CVE latest(firstPublished) as Veroeffentlicht by advisoryId
| eval sev=case(Schwere="Critical", 0, Schwere="High", 1, true(), 2) | sort sev - CVSS | fields - sev | rename advisoryId as Advisory`),
        ds_affected: chain('ds_adv', `| search advisoryId="$advisory$"
| stats latest(productId) as Modell latest(softwareVersion) as Software latest(fixedVersion) as "Fix in" latest(severity) as Schwere values(advisoryId) as Advisory latest(building) as Haus by hostname
| rename hostname as Geraet | sort Haus Geraet`),
        ds_lifecycle: chain('ds_assets', '| stats count by lifecycleStage'),
        ds_coverage: chain('ds_assets', '| stats count by coverageStatus'),
        ds_family: chain('ds_assets', '| stats count as Geraete by productId | sort - Geraete | head 12 | rename productId as Modell'),
        ds_eol: chain('ds_assets', `| where lifecycleStage!="Active"
| stats count as Geraete values(building) as Haeuser by productId lifecycleStage endOfSaleDate lastDateOfSupport
| rename productId as Modell lifecycleStage as Lifecycle endOfSaleDate as "End of Sale" lastDateOfSupport as "Last Date of Support"`),
        ds_contracts: search(`${IDX} sourcetype="cisco:iq:contract" earliest=-7h | stats latest(serviceLevel) as Servicelevel latest(coverageEndDate) as "Laeuft bis" latest(devicesCovered) as Geraete latest(status) as Status by contractNumber | rename contractNumber as Vertrag`),
        ds_fn: search(`${IDX} sourcetype="cisco:iq:fieldnotice" earliest=-7h | stats dc(hostname) as Geraete latest(title) as Titel by fieldNoticeId status | rename fieldNoticeId as "Field Notice" status as Status`),
    },
    rows: [
        {
            section: 'Inventar',
            h: 150,
            panels: [
                { cols: 2, title: 'Cisco-Assets', viz: kpi('ds_k_assets', { decimals: 0, spark: false, color: '#049fd9' }) },
                { cols: 2, title: 'Kritisch betroffen', viz: kpi('ds_k_crit', { decimals: 0, spark: false, warn: 1, crit: 1, higher: false }) },
                { cols: 2, title: 'End of Support', viz: kpi('ds_k_eos', { decimals: 0, spark: false, warn: 1, crit: 20, higher: false }) },
                { cols: 2, title: 'Ohne Vertrag', viz: kpi('ds_k_nocov', { decimals: 0, spark: false, warn: 1, crit: 10, higher: false }) },
                { cols: 2, title: 'Vertrag laeuft ab', viz: kpi('ds_k_exp', { decimals: 0, spark: false, warn: 1, crit: 20, higher: false }) },
                { cols: 2, title: 'Field Notices', viz: kpi('ds_k_fn', { decimals: 0, spark: false, color: '#ffc53d' }) },
            ],
        },
        {
            section: 'Security Advisories (PSIRT)',
            h: 380,
            panels: [
                { cols: 12, title: 'Advisories mit betroffenen Geraeten', hint: 'Klick auf eine Zeile zeigt die betroffenen Geraete', viz: table('ds_adv_table', { count: 8, status: ['Schwere'], drill: setToken('advisory', 'row.Advisory.value') }) },
            ],
        },
        {
            h: 420,
            panels: [{ cols: 12, title: 'Betroffene Geraete', viz: table('ds_affected', { count: 10, status: ['Schwere'] }) }],
        },
        {
            section: 'Lifecycle und Vertraege',
            h: 340,
            panels: [
                { cols: 3, title: 'Lifecycle', viz: pie('ds_lifecycle', { colors: ['#34e2a0', '#ffc53d', '#ff4d6d'] }) },
                { cols: 3, title: 'Vertragsabdeckung', viz: pie('ds_coverage', { colors: ['#34e2a0', '#ffc53d', '#ff4d6d'] }) },
                { cols: 6, title: 'Geraete je Modell', viz: bar('ds_family') },
            ],
        },
        {
            h: 360,
            panels: [
                { cols: 5, title: 'End of Life', viz: table('ds_eol', { count: 8, status: ['Lifecycle'] }) },
                { cols: 4, title: 'Servicevertraege (SNTC)', viz: table('ds_contracts', { count: 8, status: ['Status'] }) },
                { cols: 3, title: 'Field Notices', viz: table('ds_fn', { count: 8 }) },
            ],
        },
    ],
};
