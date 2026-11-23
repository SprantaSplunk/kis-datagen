import { cell, findField, opt, optEnum, toNumber, toText } from '../../../shared/data.js';

export const DEFAULTS = {
    scaleMode: 'relative',
    higherIsBetter: false,
    warn: 50,
    crit: 80,
    unit: '',
    decimals: 1,
    maxSeries: 24,
    drilldownToken: 'series',
};

export function readOptions(options) {
    return {
        scaleMode: optEnum(options, 'scaleMode', ['relative', 'thresholds'], DEFAULTS.scaleMode),
        higherIsBetter: opt(options, 'higherIsBetter', DEFAULTS.higherIsBetter),
        warn: opt(options, 'warn', DEFAULTS.warn),
        crit: opt(options, 'crit', DEFAULTS.crit),
        unit: opt(options, 'unit', DEFAULTS.unit),
        decimals: Math.round(Math.min(4, Math.max(0, opt(options, 'decimals', DEFAULTS.decimals)))),
        maxSeries: Math.round(Math.min(200, Math.max(1, opt(options, 'maxSeries', DEFAULTS.maxSeries)))),
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken),
    };
}

function parseTime(value) {
    const text = toText(value).trim();
    if (!text) return NaN;
    if (/^\d+(\.\d+)?$/.test(text)) {
        const numeric = Number(text);
        return numeric < 1e11 ? numeric * 1000 : numeric;
    }
    return Date.parse(text);
}

// accepts timechart output (_time + one column per series) or long rows (time, series, value)
export function toModel(normalized, options) {
    const o = readOptions(options);
    const timeField = findField(normalized, ['_time', 'time', 'timestamp']);
    if (timeField < 0) return { error: 'Heat Timeline needs a "_time" column, for example from timechart.' };

    const seriesField = findField(normalized, ['series', 'name']);
    const valueField = findField(normalized, ['value', 'count']);
    const byName = new Map();
    const times = new Map();
    const addPoint = (series, time, value) => {
        if (!series) return;
        if (!byName.has(series)) byName.set(series, new Map());
        byName.get(series).set(time, value);
        times.set(time, true);
    };

    if (seriesField >= 0 && valueField >= 0) {
        for (const row of normalized.rows) {
            const time = parseTime(cell(row, timeField));
            if (!Number.isFinite(time)) continue;
            addPoint(toText(cell(row, seriesField)).trim(), time, toNumber(cell(row, valueField)));
        }
    } else {
        const seriesColumns = normalized.fields
            .map((name, position) => ({ name, position }))
            .filter(({ name, position }) => position !== timeField && !name.startsWith('_') && name !== 'NULL');
        if (!seriesColumns.length) return { error: 'Heat Timeline needs at least one series column next to "_time".' };
        for (const row of normalized.rows) {
            const time = parseTime(cell(row, timeField));
            if (!Number.isFinite(time)) continue;
            for (const { name, position } of seriesColumns) addPoint(name, time, toNumber(cell(row, position)));
        }
    }

    const timeline = [...times.keys()].sort((a, b) => a - b);
    if (!timeline.length || !byName.size) return { empty: 'No time buckets in the result' };

    let min = Infinity;
    let max = -Infinity;
    let series = [...byName.entries()].map(([name, points]) => {
        const values = timeline.map((time) => (points.has(time) ? points.get(time) : NaN));
        const finite = values.filter(Number.isFinite);
        for (const value of finite) {
            if (value < min) min = value;
            if (value > max) max = value;
        }
        const worst = finite.length ? (o.higherIsBetter ? Math.min(...finite) : Math.max(...finite)) : NaN;
        const last = [...values].reverse().find(Number.isFinite);
        return { name, values, worst, last: last === undefined ? NaN : last };
    });
    const hidden = Math.max(0, series.length - o.maxSeries);
    series = series.slice(0, o.maxSeries);
    if (!Number.isFinite(min)) {
        min = 0;
        max = 0;
    }
    const step = timeline.length > 1 ? Math.min(...timeline.slice(1).map((t, i) => t - timeline[i])) : 0;
    return { model: { timeline, series, min, max, step, hidden, options: o } };
}

export function describe(model) {
    const o = model.options;
    const unit = o.unit ? ` ${o.unit}` : '';
    const worst = model.series
        .filter((s) => Number.isFinite(s.worst))
        .map((s) => `${s.name} ${o.higherIsBetter ? 'lowest' : 'highest'} ${s.worst.toFixed(o.decimals)}${unit}`);
    return `${model.series.length} series over ${model.timeline.length} time buckets. ${worst.slice(0, 8).join(', ')}`;
}
