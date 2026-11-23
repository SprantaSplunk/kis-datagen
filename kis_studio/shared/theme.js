// Explicit palettes: host CSS variables do not cross the extension iframe.
// Text colours meet WCAG AA (4.5:1) on the dashboard backgrounds of each theme.

const DARK = {
    name: 'dark',
    text: '#eaf2ff',
    muted: '#9fb1c9',
    faint: 'rgba(159, 177, 201, 0.35)',
    grid: 'rgba(255, 255, 255, 0.07)',
    panel: 'rgba(10, 18, 36, 0.72)',
    panelEdge: 'rgba(120, 200, 255, 0.22)',
    track: 'rgba(255, 255, 255, 0.08)',
    land: 'rgba(110, 190, 255, 0.22)',
    accent: '#22d3ee',
    accent2: '#a78bfa',
    ok: '#34e2a0',
    warn: '#ffc53d',
    crit: '#ff4d6d',
    none: '#6b7a90',
    tooltipBg: 'rgba(8, 14, 28, 0.94)',
    tooltipText: '#eaf2ff',
    focus: '#ffffff',
    glow: 1,
};

const LIGHT = {
    name: 'light',
    text: '#1a1a1a',
    muted: '#4a5562',
    faint: 'rgba(60, 68, 77, 0.3)',
    grid: 'rgba(0, 0, 0, 0.08)',
    panel: 'rgba(255, 255, 255, 0.85)',
    panelEdge: 'rgba(0, 109, 156, 0.25)',
    track: 'rgba(0, 0, 0, 0.08)',
    land: 'rgba(0, 109, 156, 0.2)',
    accent: '#006d9c',
    accent2: '#6a3fb5',
    ok: '#13804f',
    warn: '#9a5b00',
    crit: '#c8102e',
    none: '#6b7480',
    tooltipBg: 'rgba(255, 255, 255, 0.97)',
    tooltipText: '#1a1a1a',
    focus: '#1a1a1a',
    glow: 0.35,
};

export function paletteFor(theme) {
    return theme === 'dark' ? DARK : LIGHT;
}

export const STATUS_LABEL = {
    ok: 'Healthy',
    warn: 'Degraded',
    crit: 'Critical',
    none: 'No data',
};

export function statusColor(palette, status) {
    return palette[status] || palette.none;
}

// status of a value against thresholds; higherIsBetter=true means low values are bad
export function statusOf(value, warn, crit, higherIsBetter = true) {
    if (!Number.isFinite(value)) return 'none';
    if (higherIsBetter) {
        if (value <= crit) return 'crit';
        if (value <= warn) return 'warn';
        return 'ok';
    }
    if (value >= crit) return 'crit';
    if (value >= warn) return 'warn';
    return 'ok';
}

const STATUS_WORDS = {
    ok: 'ok', healthy: 'ok', good: 'ok', up: 'ok', running: 'ok', online: 'ok', normal: 'ok', green: 'ok',
    warn: 'warn', warning: 'warn', degraded: 'warn', elevated: 'warn', fair: 'warn', idle: 'warn', yellow: 'warn',
    minor: 'warn', maintenance: 'warn', high: 'warn',
    crit: 'crit', critical: 'crit', down: 'crit', error: 'crit', failed: 'crit', fault: 'crit', stopped: 'crit',
    severe: 'crit', red: 'crit', unreachable: 'crit', poor: 'crit', offline: 'crit',
    none: 'none', unknown: 'none', nodata: 'none', 'no data': 'none',
};

export function parseStatus(text) {
    if (text === undefined || text === null) return null;
    const key = String(text).trim().toLowerCase();
    return STATUS_WORDS[key] || null;
}

export const FONT = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
