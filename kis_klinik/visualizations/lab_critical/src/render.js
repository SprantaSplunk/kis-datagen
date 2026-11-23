import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, font, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

function hhmm(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function decimalsOf(t) {
    const span = (t.critHigh ?? t.refHigh ?? 10) - (t.critLow ?? t.refLow ?? 0);
    return span >= 100 ? 0 : span >= 10 ? 1 : 2;
}

// piecewise scale: [below low alarm] [between alarm limits] [above high alarm]; the outer zones use a
// square-root mapping so values far beyond the limit stay on the track without squeezing the rest
function scaleFor(t, x0, x1) {
    const values = t.results.map((r) => r.value);
    const lo = t.critLow;
    const hi = t.critHigh;
    const refLow = t.refLow ?? 0;
    const refHigh = t.refHigh ?? (hi ?? 1);
    const midStart = lo ?? Math.min(0, refLow);
    const midEnd = hi ?? refHigh * 1.6;
    const lowEnd = lo === undefined ? midStart : Math.max(0, Math.min(...values, lo - Math.max(refLow - lo, lo * 0.2)));
    const highEnd = hi === undefined ? midEnd : Math.max(...values, hi + Math.max(hi - refHigh, hi * 0.15)) * 1.02;
    const share = lo !== undefined && hi !== undefined ? [0.2, 0.6, 0.2] : lo !== undefined ? [0.3, 0.7, 0] : [0, 0.7, 0.3];
    const w = x1 - x0;
    const a = x0 + w * share[0];
    const b = a + w * share[1];
    return (v) => {
        if (lo !== undefined && v < midStart) return a - (a - x0) * Math.sqrt(clamp((midStart - v) / Math.max(1e-9, midStart - lowEnd), 0, 1));
        if (hi !== undefined && v > midEnd) return b + (x1 - b) * Math.sqrt(clamp((v - midEnd) / Math.max(1e-9, highEnd - midEnd), 0, 1));
        return a + (b - a) * clamp((v - midStart) / Math.max(1e-9, midEnd - midStart), 0, 1);
    };
}

function hash(i, salt) {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const crit = statusColor(palette, 'crit');
    const warn = statusColor(palette, 'warn');
    const ok = statusColor(palette, 'ok');
    const legendH = o.showLegend && height > 160 && width > 420 ? 22 : 0;
    const footH = model.hidden.length && height > 120 ? 16 : 0;
    const n = model.rows.length;
    const rowH = Math.max(14, (height - legendH - footH) / n);
    const labelW = clamp(width * 0.18, 70, 210);
    const rightW = width > 640 ? clamp(width * 0.2, 120, 240) : 0;
    const x0 = labelW + 12;
    const x1 = width - rightW - 14;
    const chosen = env.token ? env.token(o.drilldownToken) : undefined;
    const selectedCode = model.rows.some((t) => t.code === chosen) ? chosen : null;

    if (legendH) {
        ctx.save();
        ctx.font = font(11, 600);
        ctx.textBaseline = 'middle';
        let lx = x0;
        const items = [
            ['zone', withAlpha(ok, 0.28), 'Referenzbereich'],
            ['zone', withAlpha(warn, 0.22), 'auffaellig'],
            ['zone', withAlpha(crit, 0.2), 'jenseits Alarmgrenze'],
            ['dot', crit, 'kritischer Befund'],
            ['ring', warn, 'noch nicht im KIS'],
        ];
        for (const [kind, color, text] of items) {
            if (kind === 'zone') {
                ctx.fillStyle = color;
                roundRect(ctx, lx, 6, 18, 10, 3);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(lx + 9, 11, 4.5, 0, Math.PI * 2);
                if (kind === 'dot') {
                    ctx.fillStyle = color;
                    ctx.fill();
                } else {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = color;
                    ctx.stroke();
                }
            }
            ctx.fillStyle = palette.muted;
            ctx.fillText(text, lx + 24, 11);
            lx += 24 + ctx.measureText(text).width + 18;
            if (lx > width - 40) break;
        }
        ctx.restore();
    }

    model.rows.forEach((t, ri) => {
        const y = legendH + ri * rowH;
        const cy = y + rowH / 2;
        const selected = t.code === selectedCode;
        const hovered = env.hoverId === `test:${t.code}`;
        const scale = scaleFor(t, x0, x1);
        const th = clamp(rowH * 0.34, 6, 20);
        const dec = decimalsOf(t);

        ctx.save();
        ctx.globalAlpha = selectedCode && !selected && !hovered ? 0.4 : 1;
        if (selected) {
            ctx.fillStyle = withAlpha(palette.accent, 0.12);
            ctx.fillRect(0, y, width, rowH);
            ctx.fillStyle = palette.accent;
            ctx.fillRect(0, y, 4, rowH);
        } else if (ri % 2 === 0) {
            ctx.fillStyle = palette.track;
            ctx.fillRect(0, y, width, rowH);
        }
        if (hovered) {
            ctx.strokeStyle = palette.focus;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(1, y + 1, width - 2, rowH - 2);
        }

        // label
        ctx.textBaseline = 'middle';
        ctx.fillStyle = selected ? palette.accent : palette.text;
        const nameSize = clamp(rowH * 0.3, 9, 14);
        ctx.font = font(nameSize, 700);
        const sub = rowH > 30;
        ctx.fillText(ellipsize(ctx, t.name, labelW - 8), 8, sub ? cy - nameSize * 0.45 : cy);
        if (sub) {
            ctx.fillStyle = palette.muted;
            ctx.font = font(clamp(rowH * 0.22, 8, 11), 600);
            ctx.fillText(ellipsize(ctx, `${t.results.length} kritisch${t.unit ? ` · ${t.unit}` : ''}`, labelW - 8), 8, cy + nameSize * 0.6);
        }

        // zones
        const top = cy - th / 2;
        const zone = (from, to, color) => {
            if (!(to > from)) return;
            ctx.fillStyle = color;
            ctx.fillRect(from, top, to - from, th);
        };
        ctx.save();
        roundRect(ctx, x0, top, x1 - x0, th, th / 2);
        ctx.clip();
        ctx.fillStyle = palette.track;
        ctx.fillRect(x0, top, x1 - x0, th);
        const xl = t.critLow !== undefined ? scale(t.critLow) : x0;
        const xh = t.critHigh !== undefined ? scale(t.critHigh) : x1;
        const xrl = scale(t.refLow ?? 0);
        const xrh = scale(t.refHigh ?? 0);
        zone(x0, xl, withAlpha(crit, 0.2));
        zone(xl, xrl, withAlpha(warn, 0.22));
        zone(xrl, xrh, withAlpha(ok, 0.28));
        zone(xrh, xh, withAlpha(warn, 0.22));
        zone(xh, x1, withAlpha(crit, 0.2));
        ctx.restore();

        // alarm limits
        ctx.font = font(clamp(rowH * 0.2, 7, 10), 700);
        ctx.textAlign = 'center';
        for (const limit of [t.critLow, t.critHigh]) {
            if (limit === undefined) continue;
            const lx = scale(limit);
            ctx.strokeStyle = crit;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(lx, top - 3);
            ctx.lineTo(lx, top + th + 3);
            ctx.stroke();
            ctx.setLineDash([]);
            if (rowH > 26) {
                ctx.fillStyle = crit;
                ctx.fillText(formatNumber(limit, dec), lx, top - clamp(rowH * 0.13, 5, 9));
            }
        }
        ctx.textAlign = 'left';

        // results
        const r = clamp(rowH * 0.12, 2.5, 6);
        t.results.forEach((res, i) => {
            const px = scale(res.value);
            const latest = res === t.latest;
            const py = cy + (hash(i, ri) - 0.5) * th * 0.6;
            const rr = latest ? r * 1.35 : r;
            ctx.beginPath();
            ctx.arc(px, py, rr, 0, Math.PI * 2);
            if (res.pending) {
                ctx.fillStyle = palette.name === 'dark' ? '#0a1328' : '#ffffff';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = warn;
                ctx.stroke();
            } else {
                ctx.fillStyle = crit;
                ctx.fill();
                if (latest) {
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = palette.name === 'dark' ? '#ffffff' : '#1a1a1a';
                    ctx.stroke();
                }
            }
        });

        // latest result
        if (rightW && t.latest) {
            const lv = t.latest;
            const rx = width - rightW + 4;
            ctx.fillStyle = crit;
            ctx.font = font(clamp(rowH * 0.3, 9, 14), 800);
            const arrow = lv.high ? '\u2191' : '\u2193';
            ctx.fillText(ellipsize(ctx, `${arrow} ${formatNumber(lv.value, dec)} ${t.unit}`, rightW - 8), rx, sub ? cy - nameSize * 0.45 : cy);
            if (sub) {
                ctx.font = font(clamp(rowH * 0.22, 8, 11), 600);
                const parts = [lv.ward, hhmm(lv.time)].filter(Boolean).join(' · ');
                const pend = t.pending ? `${parts ? ' · ' : ''}${t.pending} nicht im KIS` : '';
                ctx.fillStyle = palette.muted;
                ctx.fillText(ellipsize(ctx, `zuletzt ${parts}`, rightW - 8), rx, cy + nameSize * 0.6);
                if (pend) {
                    const wPart = Math.min(rightW - 8, ctx.measureText(`zuletzt ${parts}`).width);
                    ctx.fillStyle = warn;
                    ctx.fillText(ellipsize(ctx, pend, Math.max(0, rightW - 8 - wPart)), rx + wPart, cy + nameSize * 0.6);
                }
            }
        }
        ctx.restore();

        // interaction: the row selects the test, each point explains its result
        const highs = t.results.filter((x) => x.high).length;
        const tip = [
            `${t.name}${t.unit ? ` (${t.unit})` : ''}`,
            `Referenz ${formatNumber(t.refLow, dec)}–${formatNumber(t.refHigh, dec)} · Alarm ${t.critLow !== undefined ? `< ${formatNumber(t.critLow, dec)}` : ''}${t.critLow !== undefined && t.critHigh !== undefined ? ' / ' : ''}${t.critHigh !== undefined ? `> ${formatNumber(t.critHigh, dec)}` : ''}`,
            `${t.results.length} kritisch: ${highs} zu hoch, ${t.results.length - highs} zu niedrig${t.pending ? ` · ${t.pending} nicht im KIS` : ''}`,
            selected ? 'Klick hebt die Auswahl auf' : 'Klick filtert "Kritische Werte je Station" auf diesen Test',
        ];
        hits.push({
            id: `test:${t.code}`,
            x: 0,
            y,
            w: width,
            h: rowH,
            label: `${t.name}: ${t.results.length} kritische Werte${selected ? ' (Auswahl aktiv)' : ''}`,
            tooltip: tip,
            payload: { name: o.drilldownToken, value: selected ? '*' : t.code },
        });
        t.results.forEach((res, i) => {
            const px = scale(res.value);
            const py = cy + (hash(i, ri) - 0.5) * th * 0.6;
            const lines = [
                `${t.name}: ${formatNumber(res.value, dec)} ${t.unit} ${res.high ? '(zu hoch)' : '(zu niedrig)'}`,
                [res.ward, hhmm(res.time), res.priority].filter(Boolean).join(' · '),
            ];
            if (res.delivery) lines.push(`KIS: ${res.delivery}`);
            if (res.patient) lines.push(`Fall-ID ${res.patient}`);
            hits.push({ id: `res:${t.code}:${i}`, x: px - r - 2, y: py - r - 2, w: 2 * r + 4, h: 2 * r + 4, label: lines[0], tooltip: lines, hover: true });
        });
    });

    if (footH) {
        ctx.save();
        ctx.fillStyle = palette.muted;
        ctx.font = font(11, 600);
        ctx.textBaseline = 'middle';
        const rest = model.hidden.reduce((s, t) => s + t.results.length, 0);
        ctx.fillText(`+ ${model.hidden.length} weitere Tests mit ${rest} kritischen Werten`, 8, height - footH / 2);
        ctx.restore();
    }
    return hits;
}
