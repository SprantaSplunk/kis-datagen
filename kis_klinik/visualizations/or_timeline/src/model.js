import { cell, findField, opt, optEnum, toNumber, toText } from '../../../shared/data.js';

export const DEFAULTS = { drillField: 'room', drilldownToken: 'room', showNow: true, delayWarn: 15 };

export function readOptions(options) {
    return {
        drillField: optEnum(options, 'drillField', ['room', 'case', 'department'], DEFAULTS.drillField),
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        showNow: opt(options, 'showNow', DEFAULTS.showNow),
        delayWarn: Math.max(0, opt(options, 'delayWarn', DEFAULTS.delayWarn)),
    };
}

function toEpoch(value) {
    const text = toText(value).trim();
    if (!text) return NaN;
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * (Number(text) > 1e11 ? 1 : 1000);
    return Date.parse(text);
}

// one row per case: room, case_id, procedure, planned_start, planned_end [, actual_start, actual_end, department, status]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        room: findField(normalized, ['room', 'saal']),
        id: findField(normalized, ['case_id', 'case', 'fall']),
        proc: findField(normalized, ['procedure', 'eingriff']),
        dept: findField(normalized, ['department', 'dept']),
        ps: findField(normalized, ['planned_start']),
        pe: findField(normalized, ['planned_end']),
        as: findField(normalized, ['actual_start']),
        ae: findField(normalized, ['actual_end']),
        status: findField(normalized, ['status']),
    };
    if (f.room < 0 || f.ps < 0 || f.pe < 0) {
        return { error: 'OP-Saalplan braucht die Spalten "room", "planned_start" und "planned_end" (Epoch-Sekunden oder ISO-Zeit).' };
    }
    const cases = [];
    let min = Infinity;
    let max = -Infinity;
    normalized.rows.forEach((row, i) => {
        const room = toText(cell(row, f.room)).trim();
        const ps = toEpoch(cell(row, f.ps));
        const pe = toEpoch(cell(row, f.pe));
        if (!room || !Number.isFinite(ps) || !Number.isFinite(pe)) return;
        const as = toEpoch(cell(row, f.as));
        const ae = toEpoch(cell(row, f.ae));
        const statusText = toText(cell(row, f.status)).toLowerCase();
        const cancelled = /abgesetzt|cancel/.test(statusText);
        const delay = Number.isFinite(as) ? (as - ps) / 60000 : 0;
        cases.push({
            id: toText(cell(row, f.id)).trim() || `${room}-${i}`,
            room,
            procedure: toText(cell(row, f.proc)).trim() || 'Eingriff',
            dept: toText(cell(row, f.dept)).trim(),
            ps,
            pe,
            as,
            ae,
            cancelled,
            delay,
            status: cancelled ? 'crit' : delay > o.delayWarn * 2 ? 'crit' : delay > o.delayWarn ? 'warn' : 'ok',
        });
        for (const t of [ps, pe, as, ae]) {
            if (Number.isFinite(t)) {
                min = Math.min(min, t);
                max = Math.max(max, t);
            }
        }
    });
    if (!cases.length) return { empty: 'Keine OP-Faelle im Ergebnis' };
    const rooms = [...new Set(cases.map((c) => c.room))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    const hour = 3600000;
    return {
        model: {
            options: o,
            cases,
            rooms,
            start: Math.floor(min / hour) * hour,
            end: Math.max(Math.ceil(max / hour) * hour, Math.floor(min / hour) * hour + hour),
        },
    };
}

export function describe(model) {
    const cancelled = model.cases.filter((c) => c.cancelled).length;
    const late = model.cases.filter((c) => !c.cancelled && c.status !== 'ok').length;
    return `${model.cases.length} OP-Faelle in ${model.rooms.length} Saelen, ${late} verspaetet, ${cancelled} abgesetzt`;
}
