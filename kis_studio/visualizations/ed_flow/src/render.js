import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';
import { unitNoise } from './noise.js';

const STATUS_DE = { ok: 'im Ziel', warn: 'Ziel ueberschritten', crit: 'deutlich ueberschritten', none: 'keine Daten' };

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const n = model.lanes.length;
    const gap = clamp(height * 0.025, 3, 10);
    const laneH = (height - gap * (n + 1)) / n;
    const headW = clamp(width * 0.2, 60, 200);
    const waitW = clamp(width * 0.22, 60, 240);
    const trackX = headW + 10;
    const trackW = Math.max(20, width - headW - waitW - 26);
    const maxWait = Math.max(30, ...model.lanes.map((l) => Math.max(l.target, Number.isFinite(l.longest) ? l.longest : 0)));
    const moving = o.animate && !env.still;

    model.lanes.forEach((lane, i) => {
        const y = gap + i * (laneH + gap);
        const hovered = env.hoverId === `lane:${lane.id}`;
        const sc = statusColor(palette, lane.status);

        ctx.save();
        ctx.fillStyle = withAlpha(lane.color, palette.name === 'dark' ? 0.12 : 0.1);
        roundRect(ctx, 0, y, width, laneH, 8);
        ctx.fill();
        if (hovered) {
            ctx.strokeStyle = palette.focus;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // header chip
        ctx.fillStyle = lane.color;
        roundRect(ctx, 4, y + 4, headW - 8, laneH - 8, 6);
        ctx.fill();
        ctx.fillStyle = lane.level === 3 ? '#1a1a1a' : '#ffffff';
        ctx.textBaseline = 'middle';
        const numSize = clamp(laneH * 0.5, 10, 30);
        ctx.font = font(numSize, 800);
        ctx.fillText(String(lane.level), 12, y + laneH / 2);
        const textX = 12 + numSize * 0.9;
        ctx.font = font(fitText(ctx, lane.label, headW - textX - 10, clamp(laneH * 0.26, 8, 15), 700, 7), 700);
        ctx.fillText(ellipsize(ctx, lane.label, headW - textX - 10), textX, y + laneH * (laneH > 40 ? 0.38 : 0.5));
        if (laneH > 40) {
            ctx.font = font(clamp(laneH * 0.2, 7, 12), 600);
            ctx.fillText(lane.target === 0 ? 'Ziel: sofort' : `Ziel: ${lane.target} min`, textX, y + laneH * 0.68);
        }
        ctx.restore();

        // waiting patients drift towards the doctor marker
        ctx.save();
        ctx.strokeStyle = withAlpha(lane.color, 0.35);
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(trackX, y + laneH / 2);
        ctx.lineTo(trackX + trackW, y + laneH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        const dots = Math.min(o.maxDots, Math.round(lane.waiting));
        const r = clamp(laneH * 0.13, 2.5, 8);
        for (let k = 0; k < dots; k += 1) {
            const seed = unitNoise(lane.level * 1000 + k);
            const speed = 0.012 + 0.02 * seed;
            const t = moving ? (seed + (env.time / 1000) * speed) % 1 : (k + 0.5) / Math.max(1, dots);
            const px = trackX + r + t * (trackW - 2 * r);
            const py = y + laneH / 2 + (unitNoise(k * 7 + lane.level) - 0.5) * (laneH - 2 * r - 6);
            ctx.fillStyle = lane.color;
            glow(ctx, lane.color, lane.level <= 2 ? 8 : 4, palette);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (lane.waiting > dots) {
            ctx.fillStyle = palette.muted;
            ctx.font = font(clamp(laneH * 0.22, 8, 12), 700);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`+${formatNumber(lane.waiting - dots, 0)}`, trackX + trackW, y + laneH * 0.22);
        }
        ctx.restore();

        // count and wait bar
        const wx = width - waitW - 6;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.text;
        const countSize = clamp(laneH * 0.42, 10, 26);
        ctx.font = font(countSize, 800);
        ctx.fillText(formatNumber(lane.waiting, 0), wx, y + laneH * 0.4);
        ctx.fillStyle = palette.muted;
        ctx.font = font(clamp(laneH * 0.18, 7, 11), 600);
        ctx.fillText('wartend', wx, y + laneH * 0.72);
        const bx = wx + clamp(waitW * 0.3, 30, 70);
        const bw = waitW - (bx - wx) - 4;
        const bh = clamp(laneH * 0.2, 4, 12);
        const by = y + laneH / 2 - bh / 2;
        ctx.fillStyle = palette.track;
        roundRect(ctx, bx, by, bw, bh, bh / 2);
        ctx.fill();
        if (Number.isFinite(lane.longest)) {
            ctx.fillStyle = sc;
            roundRect(ctx, bx, by, Math.max(bh, bw * clamp(lane.longest / maxWait, 0, 1)), bh, bh / 2);
            ctx.fill();
        }
        const tx = bx + bw * clamp(lane.target / maxWait, 0, 1);
        ctx.strokeStyle = palette.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, by - 4);
        ctx.lineTo(tx, by + bh + 4);
        ctx.stroke();
        if (laneH > 30) {
            ctx.fillStyle = lane.status === 'ok' ? palette.muted : sc;
            ctx.font = font(clamp(laneH * 0.17, 7, 11), 700);
            ctx.fillText(Number.isFinite(lane.longest) ? `max ${formatNumber(lane.longest, 0)} min` : '–', bx, by - clamp(laneH * 0.14, 6, 11));
        }
        ctx.restore();

        const tooltip = [`Triage ${lane.level} · ${lane.label}`, `${formatNumber(lane.waiting, 0)} wartend`];
        if (Number.isFinite(lane.longest)) tooltip.push(`Laengste Wartezeit ${formatNumber(lane.longest, 0)} min · ${STATUS_DE[lane.status]}`);
        tooltip.push(lane.target === 0 ? 'Ziel: sofortige Behandlung' : `Ziel: Arztkontakt in ${lane.target} min`);
        if (Number.isFinite(lane.treatment)) tooltip.push(`${formatNumber(lane.treatment, 0)} in Behandlung`);
        if (Number.isFinite(lane.arrivals)) tooltip.push(`${formatNumber(lane.arrivals, 0)} Zugaenge im Zeitraum`);
        hits.push({
            id: `lane:${lane.id}`,
            x: 0,
            y,
            w: width,
            h: laneH,
            label: `Triage ${lane.level} ${lane.label}: ${formatNumber(lane.waiting, 0)} wartend`,
            tooltip,
            payload: { name: o.drilldownToken, value: String(lane.level) },
        });
    });
    return hits;
}
