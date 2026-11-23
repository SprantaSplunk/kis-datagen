import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, lerp, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const HELIUM = '#60a5fa';
const STATUS_DE = { ok: 'in Betrieb', warn: 'Warnung', crit: 'Stoerung', none: 'keine Daten' };

function drawMrt(ctx, d, x, y, w, h, env, shownHe, color) {
    const palette = env.palette;
    const r = Math.min(w * 0.3, h * 0.36);
    const cx = x + w * 0.38;
    const cy = y + h * 0.5;
    // magnet housing
    ctx.fillStyle = palette.name === 'dark' ? '#13213d' : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    // rotating gradient coil ring
    const spin = env.still || d.status === 'crit' ? 0 : env.time / 900;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.strokeStyle = withAlpha(palette.accent, d.status === 'crit' ? 0.25 : 0.7);
    ctx.setLineDash([r * 0.25, r * 0.12]);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // bore
    ctx.fillStyle = palette.name === 'dark' ? '#050a16' : '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // helium tank
    const tw = clamp(w * 0.12, 10, 30);
    const th = h * 0.76;
    const tx = x + w * 0.78;
    const ty = y + h * 0.12;
    ctx.fillStyle = palette.track;
    roundRect(ctx, tx, ty, tw, th, tw / 2);
    ctx.fill();
    ctx.save();
    roundRect(ctx, tx, ty, tw, th, tw / 2);
    ctx.clip();
    const level = clamp((Number.isFinite(shownHe) ? shownHe : 0) / 100, 0, 1);
    const grad = ctx.createLinearGradient(0, ty + th, 0, ty);
    grad.addColorStop(0, HELIUM);
    grad.addColorStop(1, withAlpha(HELIUM, 0.45));
    ctx.fillStyle = d.status === 'crit' ? statusColor(palette, 'crit') : grad;
    ctx.fillRect(tx, ty + th * (1 - level), tw, th * level);
    if (d.status === 'crit' && !env.still) {
        // boil-off bubbles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let k = 0; k < 6; k += 1) {
            const p = ((env.time / 1400 + k / 6) % 1);
            ctx.beginPath();
            ctx.arc(tx + tw * (0.3 + 0.4 * ((k * 37) % 10) / 10), ty + th * (1 - level * p), tw * 0.09, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
    ctx.strokeStyle = withAlpha(HELIUM, 0.8);
    ctx.lineWidth = 1.2;
    roundRect(ctx, tx, ty, tw, th, tw / 2);
    ctx.stroke();
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.font = font(clamp(h * 0.09, 7, 13), 800);
    ctx.fillText(Number.isFinite(d.he) ? `${formatNumber(shownHe, 1)} %` : '–', tx + tw / 2, ty - clamp(h * 0.04, 4, 8));
    ctx.font = font(clamp(h * 0.065, 6, 10), 600);
    ctx.fillStyle = palette.muted;
    ctx.fillText('He', tx + tw / 2, ty + th + clamp(h * 0.07, 6, 12));
}

function drawCt(ctx, d, x, y, w, h, env, shownHeat, color) {
    const palette = env.palette;
    const r = Math.min(w * 0.3, h * 0.36);
    const cx = x + w * 0.42;
    const cy = y + h * 0.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = palette.track;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    const share = clamp((Number.isFinite(shownHeat) ? shownHeat : 0) / 100, 0, 1);
    ctx.strokeStyle = color;
    glow(ctx, color, 10, palette);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // rotating tube marker
    const a = env.still || d.status === 'crit' ? -Math.PI / 2 : env.time / 300;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(clamp(r * 0.32, 7, 18), 800);
    ctx.fillText(Number.isFinite(d.heat) ? `${formatNumber(shownHeat, 0)} %` : '–', cx, cy - r * 0.08);
    ctx.font = font(clamp(r * 0.16, 6, 10), 600);
    ctx.fillStyle = palette.muted;
    ctx.fillText('Roehre', cx, cy + r * 0.24);
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const n = model.devices.length;
    const cols = width / height > 2.2 ? Math.min(n, 6) : Math.min(n, 3);
    const rows = Math.ceil(n / cols);
    const gap = 8;
    const cw = (width - gap * (cols + 1)) / cols;
    const ch = (height - gap * (rows + 1)) / rows;
    const prev = new Map((env.previous?.devices || []).map((d) => [d.id, d]));

    model.devices.forEach((d, i) => {
        const x = gap + (i % cols) * (cw + gap);
        const y = gap + Math.floor(i / cols) * (ch + gap);
        const color = statusColor(palette, d.status);
        const hovered = env.hoverId === `dev:${d.id}`;
        const p = prev.get(d.id);
        const shownHe = Number.isFinite(d.he) ? lerp(p && Number.isFinite(p.he) ? p.he : d.he, d.he, env.progress) : NaN;
        const shownHeat = Number.isFinite(d.heat) ? lerp(p && Number.isFinite(p.heat) ? p.heat : 0, d.heat, env.progress) : NaN;
        ctx.save();
        ctx.fillStyle = palette.panel;
        ctx.strokeStyle = hovered ? palette.focus : d.status === 'ok' ? palette.panelEdge : color;
        ctx.lineWidth = hovered ? 2.5 : d.status === 'ok' ? 1 : 2;
        if (d.status === 'crit' && !env.still) glow(ctx, color, 12 + 8 * Math.sin(env.time / 260), palette);
        roundRect(ctx, x, y, cw, ch, 10);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        const headH = clamp(ch * 0.16, 12, 28);
        ctx.fillStyle = palette.text;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = font(fitText(ctx, d.id, cw * 0.5, headH * 0.7, 800, 7), 800);
        ctx.fillText(d.id, x + 10, y + headH * 0.75);
        ctx.font = font(clamp(headH * 0.45, 6, 11), 700);
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(ellipsize(ctx, (d.statusText || STATUS_DE[d.status]).toUpperCase(), cw * 0.45), x + cw - 10, y + headH * 0.75);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const bodyY = y + headH + 4;
        const footH = clamp(ch * 0.16, 10, 26);
        const bodyH = ch - headH - footH - 8;
        if (bodyH > 20) {
            ctx.save();
            if (d.kind === 'MRT') drawMrt(ctx, d, x + 6, bodyY, cw - 12, bodyH, env, shownHe, color);
            else drawCt(ctx, d, x + 6, bodyY, cw - 12, bodyH, env, shownHeat, color);
            ctx.restore();
        }
        ctx.fillStyle = palette.muted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = font(clamp(footH * 0.5, 6, 11), 600);
        const foot = d.kind === 'MRT'
            ? `${Number.isFinite(d.magnet) ? `Magnet ${formatNumber(d.magnet, 2)} K` : ''}${d.cold ? ` · Kaltkopf ${d.cold}` : ''}`
            : `${Number.isFinite(d.exams) ? `${formatNumber(d.exams, 0)} Scans heute` : ''}`;
        ctx.fillText(ellipsize(ctx, foot || d.model, cw - 20), x + 10, y + ch - footH / 2 - 2);
        ctx.restore();

        const tooltip = [`${d.id}${d.model ? ` · ${d.maker} ${d.model}` : ''}`, `${d.statusText || STATUS_DE[d.status]}`];
        if (d.kind === 'MRT') {
            if (Number.isFinite(d.he)) tooltip.push(`Helium ${formatNumber(d.he, 2)} % (Warnung < ${o.heliumWarn} %)`);
            if (Number.isFinite(d.magnet)) tooltip.push(`Magnet ${formatNumber(d.magnet, 3)} K${Number.isFinite(d.shield) ? ` · Schild ${formatNumber(d.shield, 1)} K` : ''}`);
            if (d.cold) tooltip.push(`Kaltkopf ${d.cold}`);
        } else if (Number.isFinite(d.heat)) tooltip.push(`Roehrenlast ${formatNumber(d.heat, 0)} %`);
        if (Number.isFinite(d.exams)) tooltip.push(`${formatNumber(d.exams, 0)} Untersuchungen heute`);
        hits.push({
            id: `dev:${d.id}`,
            x,
            y,
            w: cw,
            h: ch,
            label: `${d.id}: ${d.statusText || STATUS_DE[d.status]}${d.kind === 'MRT' && Number.isFinite(d.he) ? `, Helium ${formatNumber(d.he, 1)} Prozent` : ''}`,
            tooltip,
            payload: { name: o.drilldownToken, value: d.id },
        });
    });
    return hits;
}
