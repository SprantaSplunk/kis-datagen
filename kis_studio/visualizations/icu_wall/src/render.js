import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, roundRect } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const HR_COLOR = '#34e2a0';
const SPO2_COLOR = '#22d3ee';
const STATUS_DE = { ok: 'stabil', warn: 'beobachten', crit: 'kritisch', none: 'keine Daten' };

function grid(count, width, height, fixed) {
    if (fixed) return { cols: fixed, rows: Math.ceil(count / fixed) };
    let best = { cols: 1, rows: count, score: 0 };
    for (let cols = 1; cols <= count; cols += 1) {
        const rows = Math.ceil(count / cols);
        const w = width / cols;
        const h = height / rows;
        const score = Math.min(w / 1.5, h);
        if (score > best.score) best = { cols, rows, score };
    }
    return best;
}

// stylised ECG complex, s = seconds since the start of the beat; intervals are physiological and
// only compressed when the RR interval is shorter than the complex (tachycardia)
function ecg(s, rr) {
    const k = Math.min(1, rr / 0.6);
    const t = s / k;
    if (t < 0.09) return Math.sin((t / 0.09) * Math.PI) * 0.12;
    if (t < 0.16) return 0;
    if (t < 0.18) return -0.15 * ((t - 0.16) / 0.02);
    if (t < 0.205) return -0.15 + 1.15 * ((t - 0.18) / 0.025);
    if (t < 0.23) return 1 - 1.3 * ((t - 0.205) / 0.025);
    if (t < 0.25) return -0.3 + 0.3 * ((t - 0.23) / 0.02);
    if (t < 0.36) return 0;
    if (t < 0.52) return Math.sin(((t - 0.36) / 0.16) * Math.PI) * 0.22;
    return 0;
}

function hash01(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
}

// beats elapsed at time t (s): own phase per bed plus slight beat-to-beat variability
function beatsAt(t, freq, seed) {
    return t * freq + seed + 0.035 * Math.sin(t * 0.7 + seed * 6.283) + 0.02 * Math.sin(t * 0.23 + seed * 3.1);
}

function ecgValue(t, hr, seed) {
    const freq = hr / 60;
    const beats = beatsAt(t, freq, seed);
    const frac = beats - Math.floor(beats);
    return ecg(frac / freq, 1 / freq);
}

const VERTICES = [0.16, 0.18, 0.205, 0.23, 0.25];

// exact times of the QRS corners inside [t0, t1], so narrow R peaks never fall between two samples
function qrsTimes(t0, t1, hr, seed) {
    const freq = hr / 60;
    const k = Math.min(1, 1 / freq / 0.6);
    const solve = (target) => {
        let t = (target - seed) / freq;
        for (let i = 0; i < 4; i += 1) {
            const d = freq + 0.0245 * Math.cos(t * 0.7 + seed * 6.283) + 0.0046 * Math.cos(t * 0.23 + seed * 3.1);
            t -= (beatsAt(t, freq, seed) - target) / d;
        }
        return t;
    };
    const out = [];
    for (let n = Math.floor(beatsAt(t0, freq, seed)) - 1; n <= Math.ceil(beatsAt(t1, freq, seed)); n += 1) {
        for (const v of VERTICES) {
            const tv = solve(n + v * k * freq);
            if (tv >= t0 && tv <= t1) out.push(tv);
        }
    }
    return out;
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const g = grid(model.beds.length, width, height, Math.min(o.columns, model.beds.length));
    const gap = 6;
    const cw = (width - gap * (g.cols + 1)) / g.cols;
    const ch = (height - gap * (g.rows + 1)) / g.rows;

    model.beds.forEach((b, i) => {
        const x = gap + (i % g.cols) * (cw + gap);
        const y = gap + Math.floor(i / g.cols) * (ch + gap);
        const sc = statusColor(palette, b.status);
        const hovered = env.hoverId === `bed:${b.id}`;
        ctx.save();
        ctx.fillStyle = palette.name === 'dark' ? '#050b18' : '#0f172a';
        roundRect(ctx, x, y, cw, ch, 8);
        ctx.fill();
        ctx.lineWidth = hovered ? 2.5 : b.status === 'ok' ? 1 : 2;
        ctx.strokeStyle = hovered ? palette.focus : b.status === 'ok' ? 'rgba(120, 200, 255, 0.25)' : sc;
        if (b.status === 'crit' && !env.still) glow(ctx, sc, 10 + 8 * Math.sin(env.time / 220), palette);
        roundRect(ctx, x, y, cw, ch, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const pad = clamp(cw * 0.05, 4, 10);
        const titleSize = clamp(ch * 0.13, 8, 15);
        ctx.fillStyle = '#eaf2ff';
        ctx.font = font(titleSize, 700);
        ctx.textBaseline = 'top';
        ctx.fillText(ellipsize(ctx, b.bed, cw * 0.5), x + pad, y + pad);
        // NEWS2 badge
        if (Number.isFinite(b.news) && !b.offline) {
            const t = `NEWS ${formatNumber(b.news, 0)}`;
            ctx.font = font(clamp(ch * 0.1, 7, 12), 800);
            const tw = ctx.measureText(t).width + 10;
            ctx.fillStyle = sc;
            roundRect(ctx, x + cw - pad - tw, y + pad - 1, tw, titleSize + 3, 4);
            ctx.fill();
            ctx.fillStyle = b.status === 'warn' ? '#1a1a1a' : '#ffffff';
            ctx.fillText(t, x + cw - pad - tw + 5, y + pad + 1);
        }
        if (b.vent && !b.offline && cw > 90) {
            ctx.fillStyle = '#a78bfa';
            ctx.font = font(clamp(ch * 0.09, 7, 11), 700);
            ctx.fillText('beatmet', x + pad, y + pad + titleSize + 2);
        }

        if (b.offline) {
            ctx.fillStyle = '#9fb1c9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = font(fitText(ctx, 'KEINE DATEN', cw - 2 * pad, clamp(ch * 0.14, 8, 16), 800, 7), 800);
            ctx.fillText('KEINE DATEN', x + cw / 2, y + ch * 0.52);
            ctx.font = font(clamp(ch * 0.08, 7, 11), 600);
            ctx.fillText(ellipsize(ctx, b.dataStatus || 'Verbindung unterbrochen', cw - 2 * pad), x + cw / 2, y + ch * 0.7);
        } else {
            // ECG strip
            const waveTop = y + ch * 0.32;
            const waveH = ch * 0.3;
            const waveW = cw - 2 * pad;
            if (o.showWave && waveH > 8) {
                // sweep display like a bedside monitor: fixed time axis, the trace is rewritten
                // left to right and a short gap marks the write position
                const hr = clamp(Number.isFinite(b.hr) ? b.hr : 70, 30, 220);
                const seed = hash01(b.id);
                const gain = 0.85 + 0.25 * hash01(`${b.id}:gain`);
                const span = o.sweepSeconds;
                const now = env.still ? span : env.time / 1000 + seed * span;
                const cursor = env.still ? 1 : (now % span) / span;
                const gapW = env.still ? 0 : 0.04;
                const steps = Math.max(40, Math.round(waveW / 1.5));
                // segment written in the current sweep (left of the cursor) and the remainder of the
                // previous sweep (right of the gap); each frac maps to one point in time
                const segments = [[0, cursor, cursor]];
                if (cursor + gapW < 1) segments.push([cursor + gapW, 1, cursor + 1]);
                ctx.strokeStyle = HR_COLOR;
                ctx.lineWidth = 1.4;
                glow(ctx, HR_COLOR, 4, palette);
                ctx.beginPath();
                let head = null;
                segments.forEach(([f0, f1, base], si) => {
                    const fracs = [];
                    for (let s = Math.ceil(f0 * steps); s <= Math.floor(f1 * steps); s += 1) fracs.push(s / steps);
                    fracs.push(f0, f1);
                    const tOf = (frac) => now - (base - frac) * span;
                    for (const tv of qrsTimes(tOf(f0), tOf(f1), hr, seed)) fracs.push(base - (now - tv) / span);
                    fracs.sort((a, b) => a - b);
                    fracs.forEach((frac, j) => {
                        const px = x + pad + frac * waveW;
                        const py = waveTop + waveH * 0.7 - ecgValue(tOf(frac), hr, seed) * gain * waveH * 0.65;
                        if (j === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                        if (si === 0) head = [px, py];
                    });
                });
                ctx.stroke();
                ctx.shadowBlur = 0;
                if (head && !env.still) {
                    ctx.fillStyle = '#eafff6';
                    ctx.beginPath();
                    ctx.arc(head[0], head[1], 1.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (b.trend.length > 1) {
                const min = Math.min(...b.trend);
                const max = Math.max(...b.trend);
                ctx.strokeStyle = HR_COLOR;
                ctx.beginPath();
                b.trend.forEach((v, k) => {
                    const px = x + pad + (k / (b.trend.length - 1)) * waveW;
                    const py = waveTop + waveH - ((v - min) / Math.max(1, max - min)) * waveH;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                });
                ctx.stroke();
            }
            // values
            const vy = y + ch * 0.66;
            const vs = clamp(ch * 0.22, 9, 30);
            const half = (cw - 2 * pad) / 2;
            ctx.textBaseline = 'top';
            ctx.fillStyle = HR_COLOR;
            ctx.font = font(clamp(vs * 0.4, 7, 11), 700);
            ctx.fillText('HF', x + pad, vy);
            ctx.font = font(fitText(ctx, formatNumber(b.hr, 0), half - 18, vs, 800, 8), 800);
            ctx.fillText(formatNumber(b.hr, 0), x + pad + 16, vy - vs * 0.15);
            ctx.fillStyle = b.spo2 < 92 ? statusColor(palette, b.spo2 < 88 ? 'crit' : 'warn') : SPO2_COLOR;
            ctx.font = font(clamp(vs * 0.4, 7, 11), 700);
            ctx.fillText('SpO2', x + pad + half, vy);
            ctx.font = font(fitText(ctx, formatNumber(b.spo2, 0), half - 30, vs, 800, 8), 800);
            ctx.fillText(formatNumber(b.spo2, 0), x + pad + half + 30, vy - vs * 0.15);
            if (ch > 110 && Number.isFinite(b.sys)) {
                ctx.fillStyle = '#eaf2ff';
                ctx.font = font(clamp(ch * 0.075, 7, 11), 600);
                ctx.fillText(`RR ${formatNumber(b.sys, 0)}/${formatNumber(b.dia, 0)}  AF ${formatNumber(b.rr, 0)}  ${formatNumber(b.temp, 1)} °C`, x + pad, y + ch - pad - clamp(ch * 0.075, 7, 11));
            }
        }
        ctx.restore();

        const tooltip = [`Bett ${b.bed} · ${STATUS_DE[b.status]}`];
        if (b.offline) tooltip.push(b.dataStatus || 'keine Daten');
        else {
            tooltip.push(`HF ${formatNumber(b.hr, 0)} /min · SpO2 ${formatNumber(b.spo2, 0)} %`);
            if (Number.isFinite(b.sys)) tooltip.push(`RR ${formatNumber(b.sys, 0)}/${formatNumber(b.dia, 0)} mmHg · AF ${formatNumber(b.rr, 0)} /min`);
            if (Number.isFinite(b.news)) tooltip.push(`NEWS2 ${formatNumber(b.news, 0)}${b.vent ? ' · beatmet' : ''}`);
        }
        if (b.pid) tooltip.push(`Fall-ID ${b.pid}`);
        hits.push({
            id: `bed:${b.id}`,
            x,
            y,
            w: cw,
            h: ch,
            label: `Bett ${b.bed}: ${b.offline ? 'keine Daten' : `Herzfrequenz ${formatNumber(b.hr, 0)}, Sauerstoff ${formatNumber(b.spo2, 0)}`}, ${STATUS_DE[b.status]}`,
            tooltip,
            payload: { name: o.drilldownToken, value: b.bed },
        });
    });
    return hits;
}

