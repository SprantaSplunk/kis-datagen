import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const STATUS_DE = { ok: 'laeuft', warn: 'Stau', crit: 'gestoppt', none: 'keine Daten' };

function quad(p0, c, p1, t) {
    const u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const cx = width / 2;
    const cy = height / 2;
    const rx = Math.max(30, width / 2 - clamp(width * 0.1, 40, 110));
    const ry = Math.max(20, height / 2 - clamp(height * 0.12, 22, 50));
    const nodeW = clamp(width * 0.12, 46, 150);
    const nodeH = clamp(height * 0.1, 18, 40);
    const hubR = clamp(Math.min(width, height) * 0.13, 18, 70);
    const n = model.systems.length;
    const pos = {};
    model.systems.forEach((s, i) => {
        const a = Math.PI + (i / n) * Math.PI * 2;
        pos[s] = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    });
    const hub = { x: cx, y: cy };
    const moving = o.animate && !env.still;

    // channel curves: source -> hub -> target, offset per channel of the same pair
    const pairCount = {};
    model.channels.forEach((c) => {
        const key = [c.src, c.dst].sort().join('|');
        pairCount[key] = (pairCount[key] || 0) + 1;
        c._k = pairCount[key];
    });
    model.channels.forEach((c, ci) => {
        const color = c.status === 'ok' ? palette.accent : statusColor(palette, c.status);
        const hovered = env.hoverId === `ch:${c.id}`;
        const off = (c._k - 1) * 10 * (c._k % 2 ? 1 : -1);
        const a = pos[c.src];
        const b = pos[c.dst];
        const c1 = { x: (a.x + hub.x) / 2 + off, y: (a.y + hub.y) / 2 - off };
        const c2 = { x: (b.x + hub.x) / 2 - off, y: (b.y + hub.y) / 2 + off };
        ctx.save();
        ctx.lineWidth = hovered ? 3 : clamp(1 + Math.log10(1 + c.msgs) * 1.4, 1, 4);
        ctx.strokeStyle = withAlpha(color, hovered ? 0.95 : 0.45);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c1.x, c1.y, hub.x, hub.y);
        ctx.quadraticCurveTo(c2.x, c2.y, b.x, b.y);
        ctx.stroke();
        // particles
        const stuck = c.status === 'crit';
        const count = clamp(Math.round(2 + Math.log2(1 + c.msgs) * 1.5), 2, 12);
        ctx.fillStyle = color;
        glow(ctx, color, 8, palette);
        for (let k = 0; k < count; k += 1) {
            let t = moving ? ((env.time / 1000) * 0.18 + k / count + ci * 0.137) % 1 : (k + 0.5) / count;
            if (stuck) t = Math.min(t, 0.46 - (k % 4) * 0.015);
            const p = t < 0.5 ? quad(a, c1, hub, t * 2) : quad(hub, c2, b, (t - 0.5) * 2);
            ctx.beginPath();
            ctx.arc(p.x, p.y, clamp(hubR * 0.06, 1.8, 3.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        // queue badge on the inbound half
        const m = quad(a, c1, hub, 0.55);
        const label = c.queue > 0 ? formatNumber(c.queue, 0) : '';
        const br = clamp(hubR * 0.22, 7, 15) + (label.length > 2 ? 3 : 0);
        if (c.queue > 0 || hovered) {
            ctx.fillStyle = c.status === 'ok' ? withAlpha(palette.accent, 0.9) : color;
            if (c.status === 'crit' && moving) glow(ctx, color, 10 + 6 * Math.sin(env.time / 250), palette);
            ctx.beginPath();
            ctx.arc(m.x, m.y, br, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            if (label) {
                ctx.fillStyle = c.status === 'warn' ? '#1a1a1a' : '#ffffff';
                ctx.font = font(fitText(ctx, label, br * 1.8, br * 0.95, 800, 6), 800);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, m.x, m.y + 0.5);
            }
        }
        ctx.restore();
        const tooltip = [`${c.id}`, `${c.src} → ${c.dst}${c.type ? ` · ${c.type}` : ''}`, `${formatNumber(c.msgs, 0)} Nachrichten · Warteschlange ${formatNumber(c.queue, 0)} · ${STATUS_DE[c.status]}`];
        if (Number.isFinite(c.latency)) tooltip.push(`Latenz ${formatNumber(c.latency, 0)} ms`);
        hits.push({
            id: `ch:${c.id}`,
            cx: m.x,
            cy: m.y,
            r: Math.max(br, 9),
            label: `Kanal ${c.id} von ${c.src} nach ${c.dst}: Warteschlange ${formatNumber(c.queue, 0)}, ${STATUS_DE[c.status]}`,
            tooltip,
            payload: { name: o.drilldownToken, value: c.id },
        });
    });

    // hub
    ctx.save();
    const anyCrit = model.channels.some((c) => c.status === 'crit');
    const hubColor = anyCrit ? statusColor(palette, 'crit') : palette.accent2;
    const grad = ctx.createRadialGradient(hub.x, hub.y, hubR * 0.2, hub.x, hub.y, hubR);
    grad.addColorStop(0, withAlpha(hubColor, 0.55));
    grad.addColorStop(1, withAlpha(hubColor, 0.12));
    ctx.fillStyle = grad;
    glow(ctx, hubColor, anyCrit && moving ? 18 + 8 * Math.sin(env.time / 260) : 14, palette);
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hubColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = o.hubLabel.split(/\s+/);
    const size = fitText(ctx, o.hubLabel.length > 14 ? words[0] : o.hubLabel, hubR * 1.7, clamp(hubR * 0.26, 7, 15), 700, 6);
    ctx.font = font(size, 700);
    if (o.hubLabel.length > 14 && words.length > 1) {
        ctx.fillText(ellipsize(ctx, words[0], hubR * 1.8), hub.x, hub.y - size * 0.6);
        ctx.fillText(ellipsize(ctx, words.slice(1).join(' '), hubR * 1.8), hub.x, hub.y + size * 0.6);
    } else ctx.fillText(ellipsize(ctx, o.hubLabel, hubR * 1.8), hub.x, hub.y);
    ctx.restore();

    // system nodes
    for (const s of model.systems) {
        const p = pos[s];
        const st = model.systemStatus[s];
        const color = statusColor(palette, st);
        const w = s === 'KIS' ? nodeW * 1.2 : nodeW;
        const h = s === 'KIS' ? nodeH * 1.3 : nodeH;
        ctx.save();
        ctx.fillStyle = palette.name === 'dark' ? 'rgba(10, 18, 36, 0.92)' : 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = st === 'ok' ? palette.panelEdge : color;
        ctx.lineWidth = st === 'ok' ? 1 : 2;
        roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(fitText(ctx, s, w - 10, clamp(h * 0.45, 8, 16), 700, 6), 700);
        ctx.fillText(ellipsize(ctx, s, w - 8), p.x, p.y);
        ctx.restore();
        const list = model.channels.filter((c) => c.src === s || c.dst === s);
        hits.push({
            id: `sys:${s}`,
            x: p.x - w / 2,
            y: p.y - h / 2,
            w,
            h,
            hover: true,
            tooltip: [s, `${list.length} Kanaele`, ...list.filter((c) => c.status !== 'ok').map((c) => `${c.id}: ${STATUS_DE[c.status]} (${c.queue})`)],
        });
    }
    return hits;
}
