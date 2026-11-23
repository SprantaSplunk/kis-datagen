// Small design system on top of the Dashboard Studio JSON definition.
import { background, navButton, panelHeader } from './svg.mjs';

export const APP = 'kis_klinik';
export const WIDTH = 1920;
const MARGIN = 40;
const GUTTER = 20;
const COLS = 12;
const COL_W = (WIDTH - 2 * MARGIN - (COLS - 1) * GUTTER) / COLS;
const IMG = `/static/app/${APP}/images`;

export const COLORS = {
    ok: '#1e8a5a',
    warn: '#c98a00',
    crit: '#c8253f',
    text: '#13294b',
    muted: '#5b6878',
    series: ['#0b7fab', '#6b4fb3', '#1e8a5a', '#c98a00', '#c8253f', '#2f6fc4', '#b8457c', '#0f8f84', '#d0661f', '#9b3fae'],
};
export const SITE_COLORS = {};

export const DOMAINS = [
    { id: 'home', label: 'Klinik-Uebersicht', accent: '#0b7fab', accent2: '#1e8a5a', motif: 'ecg' },
    { id: 'care', label: 'Patientenversorgung', accent: '#1e8a5a', accent2: '#0b7fab', motif: 'ecg' },
    { id: 'diag', label: 'Diagnostik & Versorgung', accent: '#b8457c', accent2: '#6b4fb3', motif: 'hex' },
    { id: 'medtech', label: 'Medizintechnik', accent: '#2f6fc4', accent2: '#0b7fab', motif: 'orbit' },
    { id: 'network', label: 'Netzwerk', accent: '#0a72a6', accent2: '#1e8a5a', motif: 'mesh' },
    { id: 'it', label: 'IT-Betrieb', accent: '#0f8f84', accent2: '#2c5fb3', motif: 'circuit' },
    { id: 'security', label: 'Sicherheit', accent: '#c8253f', accent2: '#c98a00', motif: 'code' },
];

// ---------------------------------------------------------------------------
// data sources

export function search(query, { live, refresh, name } = {}) {
    const options = { query: clean(query), enableSmartSources: true };
    if (live) options.queryParameters = { earliest: live, latest: 'now' };
    if (live || refresh) {
        options.refresh = refresh || '1m';
        options.refreshType = 'delay';
    }
    return { type: 'ds.search', options, ...(name ? { name } : {}) };
}

export function chain(extend, query, name) {
    return { type: 'ds.chain', options: { extend, query: clean(query) }, ...(name ? { name } : {}) };
}

// A chain only sees the fields its base search names explicitly when the base search returns raw
// events, so such bases get a `fields` clause with every identifier their chains use.
const SHAPED = /\|\s*(stats|timechart|chart|tstats|mstats|top|rare|table|fields|transaction|geostats|xyseries|inputlookup)\b/;

const SPL_WORDS = new Set(['AND', 'OR', 'NOT', 'by', 'BY', 'over', 'as', 'span', 'limit', 'usenull', 'useother', 'true', 'false']);

export function pinBaseFields(dataSources) {
    const chainsOf = (id) => Object.values(dataSources).filter((ds) => ds.type === 'ds.chain' && ds.options.extend === id);
    for (const [id, ds] of Object.entries(dataSources)) {
        if (ds.type !== 'ds.search') continue;
        const query = ds.options.query.trim();
        if (query.startsWith('|') || SHAPED.test(query)) continue;
        const pending = chainsOf(id);
        if (!pending.length) continue;
        const names = new Set(['_time']);
        while (pending.length) {
            const chainDs = pending.pop();
            const text = chainDs.options.query
                .replace(/\$\w+\$/g, ' ')
                .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
                .replace(/'([^']*)'/g, ' $1 ')
                .replace(/\|\s*\w+/g, ' ')
                .replace(/\b(as|AS)\s+[A-Za-z_][A-Za-z0-9_]*/g, ' ')
                .replace(/\b[A-Za-z_]\w*\s*\(/g, '(')
                .replace(/\b\w+=(?=\d)/g, ' ');
            for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_.]*(\{\})?/g)) {
                const name = m[1] ? `${m[0].slice(0, -2)}{}*` : m[0].replace(/\.+$/, '');
                if (!SPL_WORDS.has(name)) names.add(name);
            }
            pending.push(...chainsOf(Object.keys(dataSources).find((k) => dataSources[k] === chainDs)));
        }
        ds.options.query = `${query}\n| fields ${[...names].sort().join(' ')}`;
    }
    return dataSources;
}

function clean(query) {
    return query
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
}

// ---------------------------------------------------------------------------
// interactions

export function link(dashboard, tokens = []) {
    return { type: 'drilldown.linkToDashboard', options: { app: APP, dashboard, tokens, newTab: false } };
}

export function linkDept(dashboard, key = 'value') {
    return link(dashboard, [{ token: 'form.dept', value: key }]);
}

export function setToken(token, key = 'value') {
    return { type: 'drilldown.setToken', options: { tokens: [{ token, key }] } };
}

// ---------------------------------------------------------------------------
// visualizations

function rangeConfig({ warn, crit, higher = true }) {
    if (warn === undefined || crit === undefined) return null;
    return higher
        ? [
              { to: crit, value: COLORS.crit },
              { from: crit, to: warn, value: COLORS.warn },
              { from: warn, value: COLORS.ok },
          ]
        : [
              { to: warn, value: COLORS.ok },
              { from: warn, to: crit, value: COLORS.warn },
              { from: crit, value: COLORS.crit },
          ];
}

export function kpi(ds, { unit = '', warn, crit, higher = true, decimals = 1, spark = true, color = '#13294b', drill } = {}) {
    const range = rangeConfig({ warn, crit, higher });
    const viz = {
        type: 'splunk.singlevalue',
        dataSources: { primary: ds },
        options: {
            majorColor: range ? '> majorValue | rangeValue(majorColorConfig)' : color,
            backgroundColor: 'transparent',
            sparklineDisplay: spark ? 'below' : 'off',
            trendDisplay: 'off',
            numberPrecision: decimals,
            sparklineStrokeColor: '#0b7fab',
            ...(unit ? { unit, unitPosition: 'after' } : {}),
        },
    };
    if (range) viz.context = { majorColorConfig: range };
    if (drill) viz.eventHandlers = [drill];
    return viz;
}

function chartBase(type, ds, { colors, bySite, legend = 'bottom', stack, yMin, yMax, drill, extra } = {}) {
    const options = {
        backgroundColor: 'transparent',
        legendDisplay: legend,
        xAxisTitleVisibility: 'hide',
        yAxisTitleVisibility: 'hide',
        seriesColors: colors || COLORS.series,
        ...(bySite ? { seriesColorsByField: SITE_COLORS } : {}),
        ...(stack ? { stackMode: stack } : {}),
        ...(yMin !== undefined ? { yAxisMin: yMin } : {}),
        ...(yMax !== undefined ? { yAxisMax: yMax } : {}),
        ...(extra || {}),
    };
    if (type === 'splunk.line') options.lineWidth = 2;
    if (type === 'splunk.area') options.areaOpacity = 0.35;
    const viz = { type, dataSources: { primary: ds }, options };
    if (drill) viz.eventHandlers = [drill];
    return viz;
}

export const line = (ds, o) => chartBase('splunk.line', ds, o);
export const area = (ds, o) => chartBase('splunk.area', ds, o);
export const column = (ds, o) => chartBase('splunk.column', ds, o);
export const bar = (ds, o) => chartBase('splunk.bar', ds, { legend: 'off', ...o });

export function pie(ds, { colors, drill } = {}) {
    const viz = {
        type: 'splunk.pie',
        dataSources: { primary: ds },
        options: { backgroundColor: 'transparent', labelDisplay: 'valuesAndPercentage', seriesColors: colors || COLORS.series, showDonutHole: true },
    };
    if (drill) viz.eventHandlers = [drill];
    return viz;
}

const STATUS_BG = [
    { match: 'Critical', value: '#f9dde1' },
    { match: 'Degraded', value: '#fcefcc' },
    { match: 'Healthy', value: '#d9f0e3' },
    { match: 'critical', value: '#f9dde1' },
    { match: 'high', value: '#f9dde1' },
    { match: 'error', value: '#f9dde1' },
    { match: 'warning', value: '#fcefcc' },
    { match: 'medium', value: '#fcefcc' },
    { match: 'stopped', value: '#f9dde1' },
    { match: 'failed', value: '#f9dde1' },
    { match: 'running', value: '#d9f0e3' },
    { match: 'success', value: '#d9f0e3' },
    { match: 'good', value: '#d9f0e3' },
    { match: 'normal', value: '#d9f0e3' },
    { match: 'Reachable', value: '#d9f0e3' },
    { match: 'Unreachable', value: '#f9dde1' },
    { match: 'kritisch', value: '#f9dde1' },
    { match: 'voll', value: '#f9dde1' },
    { match: 'gestoppt', value: '#f9dde1' },
    { match: 'Gesperrt', value: '#f9dde1' },
    { match: 'Offline', value: '#f9dde1' },
    { match: 'Failed', value: '#f9dde1' },
    { match: 'Fehler', value: '#f9dde1' },
    { match: 'Vulnerable', value: '#f9dde1' },
    { match: 'ueberfaellig', value: '#f9dde1' },
    { match: 'eskaliert an Oberarzt', value: '#f9dde1' },
    { match: 'noch nicht mitgeteilt', value: '#f9dde1' },
    { match: 'telefonisch mitgeteilt', value: '#fcefcc' },
    { match: 'in Warteschlange', value: '#fcefcc' },
    { match: 'zugestellt', value: '#d9f0e3' },
    { match: 'Rettungsstopp', value: '#f9dde1' },
    { match: 'unterbesetzt', value: '#f9dde1' },
    { match: 'niedrig', value: '#fcefcc' },
    { match: 'angespannt', value: '#fcefcc' },
    { match: 'Stau', value: '#fcefcc' },
    { match: 'Warning', value: '#fcefcc' },
    { match: 'Wartung', value: '#fcefcc' },
    { match: 'Expiring', value: '#fcefcc' },
    { match: 'End of Sale', value: '#fcefcc' },
    { match: 'End of Support', value: '#f9dde1' },
    { match: 'ueberlastet', value: '#f9dde1' },
    { match: 'ok', value: '#d9f0e3' },
    { match: 'Success', value: '#d9f0e3' },
    { match: 'in Betrieb', value: '#d9f0e3' },
    { match: 'Covered', value: '#d9f0e3' },
    { match: 'Active', value: '#d9f0e3' },
    { match: 'Operational', value: '#d9f0e3' },
    { match: 'Non-Operational', value: '#f9dde1' },
    { match: 'Not Covered', value: '#f9dde1' },
    { match: 'Critical', value: '#f9dde1' },
    { match: 'High', value: '#f9dde1' },
    { match: 'Medium', value: '#fcefcc' },
    { match: 'Error', value: '#f9dde1' },
    { match: 'Emergency', value: '#f9dde1' },
    { match: 'verdaechtig', value: '#f9dde1' },
    { match: 'Neu', value: '#fcefcc' },
    { match: 'In Bearbeitung', value: '#fcefcc' },
    { match: 'Geloest', value: '#d9f0e3' },
    { match: 'online', value: '#d9f0e3' },
    { match: 'offline', value: '#f9dde1' },
    { match: 'normal', value: '#d9f0e3' },
];

// ranges: { "Column": { warn, crit, higher } } colour numeric cells; status: ["Column"] colour words
export function table(ds, { count = 10, ranges = {}, status = [], drill } = {}) {
    const columnFormat = {};
    const context = { rowBg: ['#ffffff', '#f5f7fa'], statusBg: STATUS_BG };
    for (const [name, cfg] of Object.entries(ranges)) {
        const key = `range_${Object.keys(context).length}`;
        context[key] = rangeConfig(cfg).map((step) => ({ ...step, value: tint(step.value) }));
        columnFormat[name] = { rowBackgroundColors: `> table | seriesByName(${JSON.stringify(name)}) | rangeValue(${key})` };
    }
    for (const name of status) {
        columnFormat[name] = { rowBackgroundColors: `> table | seriesByName(${JSON.stringify(name)}) | matchValue(statusBg)` };
    }
    const viz = {
        type: 'splunk.table',
        dataSources: { primary: ds },
        options: {
            backgroundColor: 'transparent',
            count,
            headerVisibility: 'fixed',
            fontSize: 'small',
            tableFormat: {
                rowBackgroundColors: '> table | seriesByIndex(0) | pick(rowBg)',
                headerBackgroundColor: '#e9eef4',
                rowColors: '#13294b',
                headerColor: '#5b6878',
            },
            ...(Object.keys(columnFormat).length ? { columnFormat } : {}),
        },
        context,
    };
    if (drill) viz.eventHandlers = [drill];
    return viz;
}

function tint(color) {
    return { [COLORS.ok]: '#d9f0e3', [COLORS.warn]: '#fcefcc', [COLORS.crit]: '#f9dde1' }[color] || color;
}

export function markdown(text, { fontSize = 'default' } = {}) {
    return { type: 'splunk.markdown', options: { markdown: text, fontColor: COLORS.text, fontSize } };
}

export function custom(name, ds, options = {}, handlers = []) {
    const viz = { type: `${APP}.${name}`, dataSources: { primary: ds }, options };
    if (handlers.length) viz.eventHandlers = handlers;
    return viz;
}

// ---------------------------------------------------------------------------
// inputs

export const DEPT_ITEMS = [
    { label: 'Alle Abteilungen', value: '*' },
    { label: 'Innere Medizin (INN)', value: 'INN' },
    { label: 'Kardiologie (KAR)', value: 'KAR' },
    { label: 'Neurologie (NEU)', value: 'NEU' },
    { label: 'Onkologie (ONK)', value: 'ONK' },
    { label: 'Allgemeinchirurgie (CHI)', value: 'CHI' },
    { label: 'Unfallchirurgie/Orthopaedie (UCH)', value: 'UCH' },
    { label: 'Urologie (URO)', value: 'URO' },
    { label: 'HNO', value: 'HNO' },
    { label: 'Anaesthesie/OP (ANA)', value: 'ANA' },
    { label: 'Intensivmedizin (ICU)', value: 'ICU' },
    { label: 'Notaufnahme (ZNA)', value: 'ZNA' },
    { label: 'Radiologie (RAD)', value: 'RAD' },
    { label: 'Gynaekologie/Geburtshilfe (GYN)', value: 'GYN' },
    { label: 'Paediatrie (PAED)', value: 'PAED' },
    { label: 'Psychiatrie (PSY)', value: 'PSY' },
];

export const BUILDING_ITEMS = [
    { label: 'Alle Haeuser', value: '*' },
    { label: 'Haus A - Innere Medizin', value: 'A' },
    { label: 'Haus B - Chirurgisches Zentrum', value: 'B' },
    { label: 'Haus C - Akut- und Intensivzentrum', value: 'C' },
    { label: 'Haus D - Frauen, Kind und Psyche', value: 'D' },
];

function standardInputs(spec) {
    const inputs = {};
    const order = [];
    if (spec.inputs.includes('time')) {
        inputs.input_time = { type: 'input.timerange', title: 'Zeitraum', options: { token: 'global_time', defaultValue: spec.timeDefault || '-4h@m,now' } };
        order.push('input_time');
    }
    if (spec.inputs.includes('dept')) {
        inputs.input_dept = { type: 'input.dropdown', title: 'Abteilung', options: { items: DEPT_ITEMS, token: 'dept', defaultValue: '*' } };
        order.push('input_dept');
    }
    if (spec.inputs.includes('building')) {
        inputs.input_building = { type: 'input.dropdown', title: 'Haus', options: { items: BUILDING_ITEMS, token: 'building', defaultValue: '*' } };
        order.push('input_building');
    }
    for (const [id, input] of Object.entries(spec.extraInputs || {})) {
        inputs[id] = input;
        order.push(id);
    }
    return { inputs, order };
}

// dropdown fed by a search, with an "All" entry
export function dynamicDropdown({ title, token, ds, field, allLabel = 'Alle', defaultValue = '*' }) {
    return {
        type: 'input.dropdown',
        title,
        dataSources: { primary: ds },
        options: { items: '>frame(label, value) | prepend(formattedStatics) | objects()', token, defaultValue },
        context: {
            formattedConfig: { number: { prefix: '' } },
            formattedStatics: '>statics | formatByType(formattedConfig)',
            statics: [[allLabel], ['*']],
            label: `>primary | seriesByName("${field}") | renameSeries("label") | formatByType(formattedConfig)`,
            value: `>primary | seriesByName("${field}") | renameSeries("value") | formatByType(formattedConfig)`,
        },
    };
}

// ---------------------------------------------------------------------------
// page assembly

const HEADER_NAV_Y = 142;
const NAV_H = 46;
const NAV_W = 236;
const SUB_Y = 212;
const SUB_H = 36;
const SUB_W = 218;

export function buildPage(spec, registry) {
    const domain = DOMAINS.find((d) => d.id === spec.domain);
    if (!domain) throw new Error(`${spec.id}: unknown domain ${spec.domain}`);
    const siblings = registry.filter((p) => p.domain === spec.domain && !p.hidden);
    const visualizations = {};
    const structure = [];
    const svgs = {};
    const panels = [];
    const sections = [];

    // domain navigation
    DOMAINS.filter((d) => !d.hidden).forEach((d, i) => {
        const target = registry.find((p) => p.domain === d.id);
        const active = d.id === domain.id;
        const file = `nav_${d.id}${active ? '_on' : ''}.svg`;
        svgs[file] = navButton({ label: d.label, width: NAV_W, height: NAV_H, accent: d.accent, accent2: d.accent2, active });
        const id = `viz_nav_${d.id}`;
        visualizations[id] = {
            type: 'splunk.image',
            options: { src: `${IMG}/${file}`, preserveAspectRatio: true },
            ...(active && spec.id === target.id ? {} : { eventHandlers: [link(target.id)] }),
        };
        structure.push({ item: id, type: 'block', position: { x: MARGIN + i * (NAV_W + 14), y: HEADER_NAV_Y, w: NAV_W, h: NAV_H } });
    });

    let y = HEADER_NAV_Y + NAV_H + 24;
    if (siblings.length > 1) {
        siblings.forEach((p, i) => {
            const active = p.id === spec.id;
            const file = `sub_${p.id}${active ? '_on' : ''}.svg`;
            svgs[file] = navButton({ label: p.navLabel, width: SUB_W, height: SUB_H, accent: domain.accent, accent2: domain.accent2, active, small: true });
            const id = `viz_sub_${p.id}`;
            visualizations[id] = {
                type: 'splunk.image',
                options: { src: `${IMG}/${file}`, preserveAspectRatio: true },
                ...(active ? {} : { eventHandlers: [link(p.id)] }),
            };
            structure.push({ item: id, type: 'block', position: { x: MARGIN + i * (SUB_W + 12), y: SUB_Y, w: SUB_W, h: SUB_H } });
        });
        y = SUB_Y + SUB_H + 22;
    }

    let vizCount = 0;
    for (const row of spec.rows) {
        if (row.section) {
            sections.push({ label: row.section, x: MARGIN, y: y + 14 });
            y += 30;
        }
        let x = MARGIN;
        const used = row.panels.reduce((sum, p) => sum + p.cols, 0);
        if (used > COLS) throw new Error(`${spec.id}: row uses ${used} columns`);
        for (const panel of row.panels) {
            const w = Math.round(panel.cols * COL_W + (panel.cols - 1) * GUTTER);
            const h = panel.h || row.h;
            panels.push({ x, y, w, h, title: panel.title, hint: panel.hint, accent: panel.accent });
            const top = panelHeader({ title: panel.title, hint: panel.hint, w }).top;
            const inset = panel.inset ?? 12;
            const vizList = Array.isArray(panel.viz) ? panel.viz : [panel.viz];
            vizList.forEach((viz, index) => {
                vizCount += 1;
                const id = panel.id ? `${panel.id}${vizList.length > 1 ? `_${index}` : ''}` : `viz_${String(vizCount).padStart(2, '0')}`;
                if (viz.dataSources && !spec.dataSources[viz.dataSources.primary]) throw new Error(`${spec.id}: missing data source ${viz.dataSources.primary}`);
                if (panel.showWhen && !spec.conditions?.[panel.showWhen]) throw new Error(`${spec.id}: unknown condition ${panel.showWhen}`);
                visualizations[id] = panel.showWhen ? { ...viz, containerOptions: { visibility: { showConditions: [panel.showWhen] } } } : viz;
                const share = (w - 2 * inset) / vizList.length;
                structure.push({
                    item: id,
                    type: 'block',
                    position: { x: Math.round(x + inset + index * share), y: y + top, w: Math.round(share), h: h - top - inset },
                });
            });
            x += w + GUTTER;
        }
        y += row.h + GUTTER;
    }
    const height = y + 20;

    for (const [id, ds] of Object.entries(spec.dataSources)) {
        if (ds.type === 'ds.chain' && !spec.dataSources[ds.options.extend]) throw new Error(`${spec.id}: chain ${id} extends missing ${ds.options.extend}`);
    }

    const bgFile = `bg_${spec.id}.svg`;
    svgs[bgFile] = background({
        id: spec.id,
        width: WIDTH,
        height,
        domain,
        title: spec.title,
        subtitle: spec.subtitle,
        kicker: `KIS Klinik · Splunk Allgemeines Krankenhaus · ${domain.label}`,
        panels,
        sections,
    });

    const { inputs, order } = standardInputs(spec);
    const tokenDefaults = {};
    for (const [token, value] of Object.entries(spec.tokens || {})) tokenDefaults[token] = { value };

    const definition = {
        title: spec.title,
        description: spec.description,
        inputs,
        defaults: {
            dataSources: {
                'ds.search': { options: { queryParameters: { earliest: '$global_time.earliest$', latest: '$global_time.latest$' } } },
            },
            ...(Object.keys(tokenDefaults).length ? { tokens: { default: tokenDefaults } } : {}),
        },
        dataSources: spec.dataSources,
        ...(spec.conditions ? { expressions: { conditions: spec.conditions } } : {}),
        visualizations,
        layout: {
            type: 'absolute',
            options: {
                width: WIDTH,
                height,
                display: 'auto-scale',
                backgroundColor: '#eef1f5',
                backgroundImage: { src: `${IMG}/${bgFile}`, sizeType: 'cover', x: 0, y: 0 },
            },
            structure,
            globalInputs: order,
        },
    };
    const json = JSON.stringify(definition, null, 4);
    if (json.includes(']]>')) throw new Error(`${spec.id}: definition contains a CDATA terminator`);
    const xml = `<dashboard version="2" theme="light">
    <label>${xmlEsc(spec.navLabel)}</label>
    <description>${xmlEsc(spec.description)}</description>
    <definition><![CDATA[${json}]]></definition>
    <meta type="hiddenElements"><![CDATA[{"hideEdit": false, "hideOpenInSearch": false, "hideExport": false}]]></meta>
</dashboard>
`;
    return { xml, svgs, definition };
}

function xmlEsc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
