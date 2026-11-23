import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';

export const DEFAULTS = { drilldownToken: 'lab_test', maxRows: 12, showLegend: true };

// reference range and alarm limits when the search does not return them (TA-kis-datagen before 1.0.7)
export const LIMITS = {
    HB: { name: 'Haemoglobin', unit: 'g/dL', refLow: 12, refHigh: 17, critLow: 7, critHigh: 20 },
    LEUKO: { name: 'Leukozyten', unit: 'G/L', refLow: 4, refHigh: 10, critLow: 1, critHigh: 30 },
    THROMBO: { name: 'Thrombozyten', unit: 'G/L', refLow: 150, refHigh: 400, critLow: 30, critHigh: 1000 },
    NA: { name: 'Natrium', unit: 'mmol/L', refLow: 135, refHigh: 145, critLow: 120, critHigh: 160 },
    K: { name: 'Kalium', unit: 'mmol/L', refLow: 3.5, refHigh: 5.1, critLow: 2.8, critHigh: 6.2 },
    KREA: { name: 'Kreatinin', unit: 'mg/dL', refLow: 0.6, refHigh: 1.2, critHigh: 5 },
    CRP: { name: 'C-reaktives Protein', unit: 'mg/L', refLow: 0, refHigh: 5, critHigh: 300 },
    TROP: { name: 'Troponin T hs', unit: 'ng/L', refLow: 0, refHigh: 14, critHigh: 100 },
    LAKTAT: { name: 'Laktat', unit: 'mmol/L', refLow: 0.5, refHigh: 2.2, critHigh: 4 },
    INR: { name: 'INR', unit: '', refLow: 0.9, refHigh: 1.2, critHigh: 4.5 },
    GLU: { name: 'Glukose', unit: 'mg/dL', refLow: 70, refHigh: 110, critLow: 40, critHigh: 400 },
    PCT: { name: 'Procalcitonin', unit: 'ng/mL', refLow: 0, refHigh: 0.5, critHigh: 10 },
};

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        maxRows: Math.round(Math.min(30, Math.max(1, opt(options, 'maxRows', DEFAULTS.maxRows)))),
        showLegend: opt(options, 'showLegend', DEFAULTS.showLegend),
    };
}

function toTime(value) {
    const text = toText(value).trim();
    if (!text) return NaN;
    const n = Number(text);
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    return Date.parse(text);
}

const finite = (...values) => values.find((v) => Number.isFinite(v));

// one row per critical result: test_code, value [, test_name, unit, ref_low, ref_high, crit_low, crit_high,
// flag, ward, _time, priority, delivery_status, patient_id]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        code: findField(normalized, ['test_code', 'code', 'test']),
        name: findField(normalized, ['test_name', 'name', 'Test']),
        value: findField(normalized, ['value', 'Wert']),
        unit: findField(normalized, ['unit', 'einheit']),
        refLow: findField(normalized, ['ref_low']),
        refHigh: findField(normalized, ['ref_high']),
        critLow: findField(normalized, ['crit_low', 'critical_low']),
        critHigh: findField(normalized, ['crit_high', 'critical_high']),
        flag: findField(normalized, ['flag']),
        ward: findField(normalized, ['ward', 'station', 'department']),
        time: findField(normalized, ['_time', 'time', 'zeit']),
        priority: findField(normalized, ['priority', 'prioritaet']),
        delivery: findField(normalized, ['delivery_status', 'zustellung']),
        patient: findField(normalized, ['patient_id', 'patient']),
        ackState: findField(normalized, ['ack_state']),
        ackMin: findField(normalized, ['ack_min']),
        ackRole: findField(normalized, ['ack_role']),
        escalated: findField(normalized, ['escalated']),
        reason: findField(normalized, ['reason', 'grund']),
    };
    if ((f.code < 0 && f.name < 0) || f.value < 0) {
        return { error: 'Kritische Laborwerte braucht die Spalten "test_code" (oder "test_name") und "value" (optional "ref_low", "ref_high", "crit_low", "crit_high", "ward", "_time", "delivery_status").' };
    }
    const tests = new Map();
    for (const row of normalized.rows) {
        const value = toNumber(cell(row, f.value));
        if (!Number.isFinite(value)) continue;
        const code = (toText(cell(row, f.code)).trim() || toText(cell(row, f.name)).trim()).toUpperCase();
        if (!code) continue;
        const known = LIMITS[code] || {};
        if (!tests.has(code)) {
            tests.set(code, {
                code,
                name: toText(cell(row, f.name)).trim() || known.name || code,
                unit: toText(cell(row, f.unit)).trim() || known.unit || '',
                refLow: finite(toNumber(cell(row, f.refLow)), known.refLow),
                refHigh: finite(toNumber(cell(row, f.refHigh)), known.refHigh),
                critLow: finite(toNumber(cell(row, f.critLow)), known.critLow),
                critHigh: finite(toNumber(cell(row, f.critHigh)), known.critHigh),
                results: [],
            });
        }
        const t = tests.get(code);
        const flagText = toText(cell(row, f.flag)).trim().toUpperCase();
        const delivery = toText(cell(row, f.delivery)).trim();
        t.results.push({
            value,
            high: flagText ? flagText.startsWith('H') : Number.isFinite(t.critHigh) && value >= t.critHigh,
            ward: toText(cell(row, f.ward)).trim(),
            time: toTime(cell(row, f.time)),
            priority: toText(cell(row, f.priority)).trim(),
            delivery,
            pending: Boolean(delivery) && !/zugestellt|delivered|ok/i.test(delivery),
            patient: toText(cell(row, f.patient)).trim(),
            ackMin: toNumber(cell(row, f.ackMin)),
            ackRole: toText(cell(row, f.ackRole)).trim(),
            escalated: toNumber(cell(row, f.escalated), 0),
            reason: toText(cell(row, f.reason)).trim(),
            unacked: f.ackState >= 0
                ? toText(cell(row, f.ackState)).trim().toLowerCase() === 'offen'
                : f.ackMin >= 0 && !Number.isFinite(toNumber(cell(row, f.ackMin))),
        });
    }
    if (!tests.size) return { empty: 'Keine kritischen Laborwerte im Zeitraum' };
    const rows = [...tests.values()];
    for (const t of rows) {
        t.results.sort((a, b) => (a.time || 0) - (b.time || 0));
        t.latest = t.results[t.results.length - 1];
        t.pending = t.results.filter((r) => r.pending).length;
        t.unacked = t.results.filter((r) => r.unacked).length;
        if (!Number.isFinite(t.critLow) || t.critLow <= 0) t.critLow = undefined;
        if (!Number.isFinite(t.critHigh)) t.critHigh = undefined;
    }
    rows.sort((a, b) => b.results.length - a.results.length || a.name.localeCompare(b.name));
    const total = rows.reduce((n, t) => n + t.results.length, 0);
    return { model: { options: o, rows: rows.slice(0, o.maxRows), hidden: rows.slice(o.maxRows), total } };
}

export function describe(model) {
    const top = model.rows[0];
    const pending = model.rows.reduce((n, t) => n + t.pending, 0);
    const unacked = model.rows.reduce((n, t) => n + t.unacked, 0);
    return `${model.total} kritische Laborwerte in ${model.rows.length + model.hidden.length} Tests. Haeufigster: ${top.name} (${top.results.length}).${unacked ? ` ${unacked} nicht quittiert.` : ''}${pending ? ` ${pending} noch nicht im KIS.` : ''}`;
}
