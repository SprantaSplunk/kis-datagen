import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';

export const DEFAULTS = { drilldownToken: 'triage', maxDots: 40, animate: true };
export const MTS = {
    1: { color: '#e5203a', label: 'Sofort', target: 0 },
    2: { color: '#f97316', label: 'Sehr dringend', target: 10 },
    3: { color: '#facc15', label: 'Dringend', target: 30 },
    4: { color: '#22c55e', label: 'Normal', target: 90 },
    5: { color: '#3b82f6', label: 'Nicht dringend', target: 120 },
};

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        maxDots: Math.round(Math.min(200, Math.max(5, opt(options, 'maxDots', DEFAULTS.maxDots)))),
        animate: opt(options, 'animate', DEFAULTS.animate),
    };
}

// one row per triage level: triage_level, waiting [, in_treatment, longest_wait_min, target_min, arrivals]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        level: findField(normalized, ['triage_level', 'triage', 'level']),
        waiting: findField(normalized, ['waiting', 'wartend']),
        treat: findField(normalized, ['in_treatment', 'treatment']),
        longest: findField(normalized, ['longest_wait_min', 'longest_wait', 'wait_min']),
        target: findField(normalized, ['target_min', 'max_wait_min']),
        arrivals: findField(normalized, ['arrivals', 'count']),
    };
    if (f.level < 0 || f.waiting < 0) {
        return { error: 'Notaufnahme-Fluss braucht die Spalten "triage_level" (1-5) und "waiting".' };
    }
    const lanes = [];
    for (const row of normalized.rows) {
        const level = Math.round(toNumber(cell(row, f.level)));
        if (!MTS[level]) continue;
        const target = toNumber(cell(row, f.target), MTS[level].target);
        const longest = toNumber(cell(row, f.longest));
        const waiting = Math.max(0, toNumber(cell(row, f.waiting), 0));
        let status = 'ok';
        if (Number.isFinite(longest) && longest > target * 1.5 + 5) status = 'crit';
        else if (Number.isFinite(longest) && longest > target) status = 'warn';
        if (level <= 2 && waiting > 0 && status === 'ok') status = 'warn';
        lanes.push({
            id: String(level),
            level,
            label: toText(MTS[level].label),
            color: MTS[level].color,
            waiting,
            treatment: toNumber(cell(row, f.treat)),
            longest,
            target,
            arrivals: toNumber(cell(row, f.arrivals)),
            status,
        });
    }
    if (!lanes.length) return { empty: 'Keine Triage-Stufen im Ergebnis' };
    const merged = new Map();
    for (const lane of lanes) {
        const cur = merged.get(lane.id);
        if (!cur) merged.set(lane.id, lane);
        else {
            cur.waiting += lane.waiting;
            if (Number.isFinite(lane.longest)) cur.longest = Math.max(Number.isFinite(cur.longest) ? cur.longest : 0, lane.longest);
        }
    }
    const list = [...merged.values()].sort((a, b) => a.level - b.level);
    return { model: { options: o, lanes: list, total: list.reduce((s, l) => s + l.waiting, 0) } };
}

export function describe(model) {
    return `${model.total} Patientinnen und Patienten warten. ${model.lanes
        .map((l) => `Stufe ${l.level} ${l.label}: ${l.waiting}${Number.isFinite(l.longest) ? `, laengste Wartezeit ${Math.round(l.longest)} min` : ''}`)
        .join('; ')}`;
}
