// Framework-neutral result handling: Studio delivers columnar results with string values.

export function normalizeSearchData(data) {
    const fields = (data?.fields || []).map((field) =>
        typeof field === 'string' ? field : String(field?.name ?? '')
    );
    let rows = [];
    if (Array.isArray(data?.rows) && data.rows.length) {
        rows = data.rows;
    } else if (Array.isArray(data?.columns) && data.columns.length) {
        const length = Math.max(0, ...data.columns.map((column) => (Array.isArray(column) ? column.length : 0)));
        rows = Array.from({ length }, (_, rowIndex) =>
            data.columns.map((column) => (Array.isArray(column) ? column[rowIndex] : undefined))
        );
    }
    const index = {};
    fields.forEach((name, position) => {
        index[name.toLowerCase()] = position;
    });
    return { fields, rows, index };
}

// first matching field (case-insensitive) from a list of candidate names
export function findField(normalized, candidates) {
    for (const name of candidates) {
        if (!name) continue;
        const position = normalized.index[String(name).toLowerCase()];
        if (position !== undefined) return position;
    }
    return -1;
}

export function toNumber(value, fallback = NaN) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number.parseFloat(Array.isArray(value) ? value[0] : value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function toText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    if (Array.isArray(value)) return value.length ? String(value[0]) : fallback;
    return String(value);
}

export function cell(row, position) {
    return position >= 0 ? row[position] : undefined;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function titleCase(text) {
    return String(text)
        .split(/([\s_-]+)/)
        .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join('');
}

export function formatNumber(value, decimals = 1) {
    if (!Number.isFinite(value)) return '–';
    const abs = Math.abs(value);
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}k`;
    const fixed = value.toFixed(decimals);
    return decimals > 0 ? fixed.replace(/\.0+$/, '') : fixed;
}

// option with type check and fallback; source-editor values may have any type
export function opt(options, key, fallback) {
    const value = options?.[key];
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof fallback === 'number') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (typeof fallback === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 1 || value === '1') return true;
        if (value === 'false' || value === 0 || value === '0') return false;
        return fallback;
    }
    return String(value);
}

export function optEnum(options, key, allowed, fallback) {
    const value = opt(options, key, fallback);
    return allowed.includes(value) ? value : fallback;
}
