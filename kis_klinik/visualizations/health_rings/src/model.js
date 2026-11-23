import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';
import { parseStatus, statusOf } from '../../../shared/theme.js';

export const DEFAULTS = {
    warn: 90,
    crit: 75,
    higherIsBetter: true,
    min: 0,
    max: 100,
    decimals: 1,
    unit: '',
    columns: 0,
    drilldownToken: 'name',
    clickHint: '',
};

export function readOptions(options) {
    return {
        warn: opt(options, 'warn', DEFAULTS.warn),
        crit: opt(options, 'crit', DEFAULTS.crit),
        higherIsBetter: opt(options, 'higherIsBetter', DEFAULTS.higherIsBetter),
        min: opt(options, 'min', DEFAULTS.min),
        max: opt(options, 'max', DEFAULTS.max),
        decimals: Math.round(Math.min(3, Math.max(0, opt(options, 'decimals', DEFAULTS.decimals)))),
        unit: opt(options, 'unit', DEFAULTS.unit),
        columns: Math.round(Math.min(12, Math.max(0, opt(options, 'columns', DEFAULTS.columns)))),
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken),
        clickHint: String(opt(options, 'clickHint', DEFAULTS.clickHint) ?? ''),
    };
}

// one ring per row; per-row unit/min/max/warn/crit/better columns override the options
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        name: findField(normalized, ['name', 'label', 'kpi', 'site', 'domain', 'location']),
        value: findField(normalized, ['value', 'score', 'health', 'pct']),
        unit: findField(normalized, ['unit']),
        min: findField(normalized, ['min']),
        max: findField(normalized, ['max']),
        warn: findField(normalized, ['warn', 'warning']),
        crit: findField(normalized, ['crit', 'critical']),
        better: findField(normalized, ['better', 'direction']),
        status: findField(normalized, ['status']),
        detail: findField(normalized, ['detail', 'details', 'subtitle', 'info']),
        key: findField(normalized, ['key', 'id', 'drilldown']),
    };
    if (f.value < 0 && normalized.fields.length >= 2) {
        // single-row result: every numeric column becomes a ring (e.g. "| stats avg(a) as A avg(b) as B")
        if (normalized.rows.length === 1) return wideModel(normalized, o);
    }
    if (f.name < 0 || f.value < 0) return { error: 'Health Rings needs "name" and "value" columns, or a single row of numeric columns.' };

    const items = [];
    normalized.rows.forEach((row, index) => {
        const name = toText(cell(row, f.name)).trim();
        if (!name) return;
        const value = toNumber(cell(row, f.value));
        const better = toText(cell(row, f.better)).toLowerCase();
        const higher = better ? !['low', 'lower', 'down', 'min'].includes(better) : o.higherIsBetter;
        const warn = toNumber(cell(row, f.warn), o.warn);
        const crit = toNumber(cell(row, f.crit), o.crit);
        const min = toNumber(cell(row, f.min), o.min);
        let max = toNumber(cell(row, f.max), o.max);
        if (!(max > min)) max = min + 1;
        const status = parseStatus(toText(cell(row, f.status))) || statusOf(value, warn, crit, higher);
        items.push({
            id: `${index}:${name}`,
            name,
            key: toText(cell(row, f.key)) || name,
            value,
            unit: toText(cell(row, f.unit), o.unit),
            min,
            max,
            warn,
            crit,
            higher,
            status,
            detail: toText(cell(row, f.detail)),
        });
    });
    if (!items.length) return { empty: 'No KPI rows in the result' };
    return { model: { items, options: o } };
}

function wideModel(normalized, o) {
    const row = normalized.rows[0];
    const items = [];
    normalized.fields.forEach((field, position) => {
        if (field.startsWith('_')) return;
        const value = toNumber(row[position]);
        if (!Number.isFinite(value)) return;
        items.push({
            id: `${position}:${field}`,
            name: field,
            key: field,
            value,
            unit: o.unit,
            min: o.min,
            max: o.max > o.min ? o.max : o.min + 1,
            warn: o.warn,
            crit: o.crit,
            higher: o.higherIsBetter,
            status: statusOf(value, o.warn, o.crit, o.higherIsBetter),
            detail: '',
        });
    });
    if (!items.length) return { error: 'Health Rings found no numeric columns in the result.' };
    return { model: { items, options: o } };
}

export function describe(model) {
    return model.items.map((item) => `${item.name} ${Number.isFinite(item.value) ? item.value : 'keine Daten'}${item.unit} ${item.status}`).join(', ');
}
