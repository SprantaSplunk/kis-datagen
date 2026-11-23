import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';

export const DEFAULTS = { drilldownToken: 'bed', news2Warn: 5, news2Crit: 7, columns: 0, showWave: true };

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        news2Warn: opt(options, 'news2Warn', DEFAULTS.news2Warn),
        news2Crit: opt(options, 'news2Crit', DEFAULTS.news2Crit),
        columns: Math.round(Math.min(20, Math.max(0, opt(options, 'columns', DEFAULTS.columns)))),
        showWave: opt(options, 'showWave', DEFAULTS.showWave),
    };
}

// one row per bed: bed, hr, spo2 [, rr, nibp_sys, nibp_dia, temp_c, news2, ventilated, data_status, trend]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        bed: findField(normalized, ['bed', 'bett']),
        hr: findField(normalized, ['hr', 'heart_rate']),
        spo2: findField(normalized, ['spo2']),
        rr: findField(normalized, ['rr', 'resp_rate']),
        sys: findField(normalized, ['nibp_sys', 'sys']),
        dia: findField(normalized, ['nibp_dia', 'dia']),
        temp: findField(normalized, ['temp_c', 'temp']),
        news: findField(normalized, ['news2', 'news']),
        vent: findField(normalized, ['ventilated', 'beatmet']),
        data: findField(normalized, ['data_status', 'status']),
        trend: findField(normalized, ['trend', 'hr_trend']),
        pid: findField(normalized, ['patient_id']),
    };
    if (f.bed < 0 || (f.hr < 0 && f.spo2 < 0 && f.data < 0)) {
        return { error: 'Intensiv-Monitorwand braucht die Spalte "bed" und Vitalwerte wie "hr" und "spo2".' };
    }
    const beds = [];
    for (const row of normalized.rows) {
        const bed = toText(cell(row, f.bed)).trim();
        if (!bed) continue;
        const dataStatus = toText(cell(row, f.data)).trim();
        const hr = toNumber(cell(row, f.hr));
        const spo2 = toNumber(cell(row, f.spo2));
        const offline = (dataStatus && dataStatus !== 'ok') || (!Number.isFinite(hr) && !Number.isFinite(spo2));
        const news = toNumber(cell(row, f.news));
        let status = 'ok';
        if (offline) status = 'none';
        else if ((Number.isFinite(news) && news >= o.news2Crit) || spo2 < 88) status = 'crit';
        else if ((Number.isFinite(news) && news >= o.news2Warn) || spo2 < 92 || hr > 120) status = 'warn';
        const trend = toText(cell(row, f.trend))
            .split(/[,; ]+/)
            .map((v) => Number.parseFloat(v))
            .filter(Number.isFinite)
            .slice(-60);
        beds.push({
            id: bed,
            bed,
            hr,
            spo2,
            rr: toNumber(cell(row, f.rr)),
            sys: toNumber(cell(row, f.sys)),
            dia: toNumber(cell(row, f.dia)),
            temp: toNumber(cell(row, f.temp)),
            news,
            vent: /^(1|true|ja|yes)$/i.test(toText(cell(row, f.vent)).trim()),
            offline,
            dataStatus,
            trend,
            pid: toText(cell(row, f.pid)).trim(),
            status,
        });
    }
    if (!beds.length) return { empty: 'Keine belegten Intensivbetten im Ergebnis' };
    beds.sort((a, b) => a.bed.localeCompare(b.bed, 'de', { numeric: true }));
    return { model: { options: o, beds } };
}

export function describe(model) {
    const crit = model.beds.filter((b) => b.status === 'crit').map((b) => b.bed);
    const off = model.beds.filter((b) => b.offline).length;
    return `${model.beds.length} Betten, ${crit.length} mit kritischem Score${crit.length ? ` (${crit.join(', ')})` : ''}${off ? `, ${off} ohne Daten` : ''}`;
}
