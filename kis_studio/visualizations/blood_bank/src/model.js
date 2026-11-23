import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';
import { parseStatus } from '../../../shared/theme.js';

export const DEFAULTS = { drilldownToken: 'blood_group', showExpiring: true, lowFactor: 1 };
const GROUP_ORDER = ['0-', '0+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const PRODUCT_ORDER = ['EK', 'TK', 'FFP'];
export const PRODUCT_LABEL = { EK: 'Erythrozyten', TK: 'Thrombozyten', FFP: 'Plasma' };

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        showExpiring: opt(options, 'showExpiring', DEFAULTS.showExpiring),
        lowFactor: Math.min(3, Math.max(0.1, opt(options, 'lowFactor', DEFAULTS.lowFactor))),
    };
}

// one row per product and blood group: product, blood_group, units_available, min_stock [, target_stock, expiring_48h, status]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        product: findField(normalized, ['product', 'produkt']),
        group: findField(normalized, ['blood_group', 'group', 'blutgruppe']),
        units: findField(normalized, ['units_available', 'units', 'bestand']),
        min: findField(normalized, ['min_stock', 'min', 'mindestbestand']),
        target: findField(normalized, ['target_stock', 'target', 'soll']),
        expiring: findField(normalized, ['expiring_48h', 'expiring']),
        reserved: findField(normalized, ['units_reserved', 'reserved']),
        days: findField(normalized, ['days_of_supply', 'days']),
        status: findField(normalized, ['status']),
    };
    if (f.group < 0 || f.units < 0) {
        return { error: 'Blutdepot braucht die Spalten "blood_group" und "units_available" (optional "product", "min_stock", "target_stock").' };
    }
    const cells = [];
    for (const row of normalized.rows) {
        const group = toText(cell(row, f.group)).trim().toUpperCase().replace('O', '0');
        if (!group) continue;
        const product = (toText(cell(row, f.product)).trim() || 'EK').toUpperCase();
        const units = toNumber(cell(row, f.units));
        const min = toNumber(cell(row, f.min));
        let target = toNumber(cell(row, f.target));
        if (!Number.isFinite(target)) target = Number.isFinite(min) ? min * 2.5 : Math.max(units, 1);
        const explicit = parseStatus(toText(cell(row, f.status)));
        let status = 'ok';
        if (!Number.isFinite(units)) status = 'none';
        else if (Number.isFinite(min) && units < min * 0.5 * o.lowFactor) status = 'crit';
        else if (Number.isFinite(min) && units < min * o.lowFactor) status = 'warn';
        if (explicit === 'crit' || /kritisch/i.test(toText(cell(row, f.status)))) status = 'crit';
        cells.push({
            id: `${product}:${group}`,
            product,
            group,
            units,
            min,
            target: Math.max(1, target),
            expiring: toNumber(cell(row, f.expiring), 0),
            reserved: toNumber(cell(row, f.reserved)),
            days: toNumber(cell(row, f.days)),
            status,
        });
    }
    if (!cells.length) return { empty: 'Keine Bestandsdaten im Ergebnis' };
    const products = [...new Set(cells.map((c) => c.product))].sort(
        (a, b) => (PRODUCT_ORDER.indexOf(a) + 99) % 99 - (PRODUCT_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b)
    );
    const groups = [...new Set(cells.map((c) => c.group))].sort(
        (a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b)
    );
    return { model: { options: o, cells, products, groups } };
}

export function describe(model) {
    const crit = model.cells.filter((c) => c.status === 'crit').map((c) => `${c.product} ${c.group}`);
    const low = model.cells.filter((c) => c.status === 'warn').map((c) => `${c.product} ${c.group}`);
    return `${model.cells.length} Bestaende. ${crit.length ? `Kritisch: ${crit.join(', ')}. ` : 'Kein kritischer Bestand. '}${low.length ? `Niedrig: ${low.join(', ')}.` : ''}`;
}
