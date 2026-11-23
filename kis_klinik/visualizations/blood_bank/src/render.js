import { clamp, formatNumber } from '../../../shared/data.js';
import { fitText, font, glow, lerp, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';
import { PRODUCT_LABEL } from './model.js';

const STATUS_DE = { ok: 'ausreichend', warn: 'unter Mindestbestand', crit: 'kritisch', none: 'keine Daten' };
const PRODUCT_TINT = { EK: '#e11d48', TK: '#f59e0b', FFP: '#facc15' };

function bagPath(ctx, x, y, w, h) {
    const neck = w * 0.22;
    const r = w * 0.22;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - neck / 2, y);
    ctx.lineTo(x + w / 2 + neck / 2, y);
    ctx.lineTo(x + w / 2 + neck / 2, y + h * 0.08);
    ctx.lineTo(x + w - r, y + h * 0.08);
    ctx.arcTo(x + w, y + h * 0.08, x + w, y + h * 0.08 + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + h * 0.08 + r);
    ctx.arcTo(x, y + h * 0.08, x + r, y + h * 0.08, r);
    ctx.lineTo(x + w / 2 - neck / 2, y + h * 0.08);
    ctx.closePath();
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const labelW = clamp(width * 0.1, 46, 110);
    const headH = clamp(height * 0.1, 16, 30);
    const cols = model.groups.length;
    const rows = model.products.length;
    const cellW = (width - labelW - 8) / cols;
    const cellH = (height - headH - 6) / rows;
    const prev = new Map((env.previous?.cells || []).map((c) => [c.id, c.units]));
    const byId = new Map(model.cells.map((c) => [c.id, c]));

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.text;
    ctx.font = font(clamp(headH * 0.6, 9, 17), 800);
    model.groups.forEach((g, gi) => ctx.fillText(g, labelW + gi * cellW + cellW / 2, headH / 2));
    ctx.restore();

    model.products.forEach((p, pi) => {
        const y0 = headH + pi * cellH;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.text;
        ctx.font = font(clamp(cellH * 0.16, 9, 16), 800);
        ctx.fillText(p, 6, y0 + cellH * 0.42);
        ctx.fillStyle = palette.muted;
        const sub = PRODUCT_LABEL[p] || '';
        ctx.font = font(fitText(ctx, sub, labelW - 10, clamp(cellH * 0.11, 7, 12), 600, 6), 600);
        ctx.fillText(sub, 6, y0 + cellH * 0.62);
        ctx.restore();

        model.groups.forEach((g, gi) => {
            const c = byId.get(`${p}:${g}`);
            if (!c) return;
            const bw = clamp(Math.min(cellW * 0.5, cellH * 0.48), 10, 70);
            const bh = clamp(cellH * 0.72, 16, 140);
            const bx = labelW + gi * cellW + (cellW - bw) / 2;
            const by = y0 + (cellH - bh) / 2 - cellH * 0.04;
            const color = statusColor(palette, c.status);
            const tint = PRODUCT_TINT[p] || palette.accent;
            const from = prev.has(c.id) && Number.isFinite(prev.get(c.id)) ? prev.get(c.id) : 0;
            const shown = Number.isFinite(c.units) ? lerp(from, c.units, env.progress) : 0;
            const level = clamp(shown / c.target, 0, 1.15);
            const hovered = env.hoverId === `bag:${c.id}`;

            ctx.save();
            bagPath(ctx, bx, by, bw, bh);
            ctx.fillStyle = palette.track;
            ctx.fill();
            ctx.save();
            bagPath(ctx, bx, by, bw, bh);
            ctx.clip();
            const fillTop = by + bh - bh * 0.92 * Math.min(1, level);
            const wave = env.still ? 0 : Math.sin(env.time / 420 + gi) * bh * 0.015;
            const grad = ctx.createLinearGradient(0, fillTop, 0, by + bh);
            grad.addColorStop(0, withAlpha(tint, 0.65));
            grad.addColorStop(1, tint);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(bx, fillTop + wave);
            ctx.quadraticCurveTo(bx + bw / 2, fillTop - wave * 2, bx + bw, fillTop + wave);
            ctx.lineTo(bx + bw, by + bh);
            ctx.lineTo(bx, by + bh);
            ctx.closePath();
            ctx.fill();
            // minimum stock line
            if (Number.isFinite(c.min)) {
                const my = by + bh - bh * 0.92 * clamp(c.min / c.target, 0, 1);
                ctx.strokeStyle = withAlpha(palette.name === 'dark' ? '#ffffff' : '#1a1a1a', 0.75);
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(bx, my);
                ctx.lineTo(bx + bw, my);
                ctx.stroke();
            }
            ctx.restore();
            ctx.setLineDash([]);
            ctx.lineWidth = hovered ? 2.4 : c.status === 'ok' ? 1.2 : 2;
            ctx.strokeStyle = hovered ? palette.focus : c.status === 'ok' ? withAlpha(palette.muted, 0.6) : color;
            if (c.status === 'crit' && !env.still) glow(ctx, color, 10 + 8 * Math.sin(env.time / 240), palette);
            bagPath(ctx, bx, by, bw, bh);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // label on its own tag: the fill edge may run through the middle of the bag
            const size = clamp(bw * 0.32, 8, 18);
            const label = formatNumber(c.units, 0);
            ctx.font = font(size, 800);
            const tagW = Math.min(bw - 4, ctx.measureText(label).width + size * 0.8);
            const tagH = size * 1.35;
            roundRect(ctx, bx + (bw - tagW) / 2, by + bh * 0.55 - tagH / 2, tagW, tagH, tagH / 2);
            ctx.fillStyle = palette.tooltipBg;
            ctx.fill();
            ctx.fillStyle = palette.text;
            ctx.fillText(label, bx + bw / 2, by + bh * 0.55 + 0.5);
            if (c.status !== 'ok') {
                ctx.fillStyle = color;
                ctx.font = font(clamp(cellH * 0.09, 7, 11), 800);
                ctx.fillText(c.status === 'crit' ? 'KRITISCH' : 'NIEDRIG', bx + bw / 2, by + bh + clamp(cellH * 0.07, 6, 12));
            } else if (o.showExpiring && c.expiring > 0 && cellH > 70) {
                ctx.fillStyle = palette.muted;
                ctx.font = font(clamp(cellH * 0.08, 7, 10), 600);
                ctx.fillText(`${formatNumber(c.expiring, 0)} verf. 48h`, bx + bw / 2, by + bh + clamp(cellH * 0.07, 6, 12));
            }
            ctx.restore();

            const tooltip = [`${p} ${g} · ${PRODUCT_LABEL[p] || p}`, `${formatNumber(c.units, 0)} Einheiten · ${STATUS_DE[c.status]}`];
            if (Number.isFinite(c.min)) tooltip.push(`Mindestbestand ${formatNumber(c.min, 0)} · Soll ${formatNumber(c.target, 0)}`);
            if (Number.isFinite(c.reserved)) tooltip.push(`${formatNumber(c.reserved, 0)} reserviert (Kreuzprobe)`);
            if (Number.isFinite(c.days)) tooltip.push(`Reichweite ${formatNumber(c.days, 1)} Tage`);
            if (c.expiring > 0) tooltip.push(`${formatNumber(c.expiring, 0)} verfallen in 48 h`);
            hits.push({
                id: `bag:${c.id}`,
                x: bx - 4,
                y: by - 2,
                w: bw + 8,
                h: bh + 4,
                label: `${p} ${g}: ${formatNumber(c.units, 0)} Einheiten, ${STATUS_DE[c.status]}`,
                tooltip,
                payload: { name: o.drilldownToken, value: g },
            });
        });
    });
    return hits;
}
