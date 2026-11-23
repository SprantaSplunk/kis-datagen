import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, lerp, withAlpha } from '../../../shared/draw.js';
import { STATUS_LABEL, statusColor } from '../../../shared/theme.js';

const START = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

function layout(count, width, height, fixedColumns) {
    let best = { columns: 1, rows: count, size: 0 };
    const tries = fixedColumns ? [fixedColumns] : Array.from({ length: count }, (_, i) => i + 1);
    for (const columns of tries) {
        const rows = Math.ceil(count / columns);
        const size = Math.min(width / columns, (height / rows) * 0.86);
        if (size > best.size) best = { columns, rows, size };
    }
    return best;
}

function fraction(item, value) {
    return clamp((value - item.min) / (item.max - item.min), 0, 1);
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const items = model.items;
    const grid = layout(items.length, width, height, Math.min(o.columns, items.length));
    const cellW = width / grid.columns;
    const cellH = height / grid.rows;
    const previous = new Map((env.previous?.items || []).map((item) => [item.id, item.value]));
    const hits = [];

    items.forEach((item, index) => {
        const column = index % grid.columns;
        const row = Math.floor(index / grid.columns);
        const lastRowCount = items.length - row * grid.columns;
        const rowOffset = row === grid.rows - 1 && lastRowCount < grid.columns ? ((grid.columns - lastRowCount) * cellW) / 2 : 0;
        const cx = rowOffset + column * cellW + cellW / 2;
        const labelSize = clamp(Math.min(cellW, cellH) * 0.085, 10, 15);
        const labelSpace = labelSize * 1.8;
        // outer edge incl. ticks is ~1.3 r above the centre, the arc ends ~0.85 r below it
        const radius = Math.max(8, Math.min((cellW - 12) / 2.6, (cellH - labelSpace - 8) / 2.15));
        const thickness = clamp(radius * 0.17, 3, 16);
        const blockH = radius * 2.15 + labelSpace;
        const cy = row * cellH + (cellH - blockH) / 2 + radius * 1.3;
        const color = statusColor(palette, item.status);
        const hovered = env.hoverId === `ring:${item.id}`;

        const from = previous.has(item.id) && Number.isFinite(previous.get(item.id)) ? previous.get(item.id) : item.min;
        const shown = Number.isFinite(item.value) ? lerp(from, item.value, env.progress) : NaN;
        const share = Number.isFinite(shown) ? fraction(item, shown) : 0;

        // track
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = thickness;
        ctx.strokeStyle = palette.track;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, START, START + SWEEP);
        ctx.stroke();

        // threshold ticks
        for (const [threshold, tone] of [[item.warn, 'warn'], [item.crit, 'crit']]) {
            if (!Number.isFinite(threshold) || threshold <= item.min || threshold >= item.max) continue;
            const angle = START + SWEEP * fraction(item, threshold);
            ctx.strokeStyle = withAlpha(statusColor(palette, tone), 0.9);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * (radius + thickness * 0.9), cy + Math.sin(angle) * (radius + thickness * 0.9));
            ctx.lineTo(cx + Math.cos(angle) * (radius + thickness * 1.6), cy + Math.sin(angle) * (radius + thickness * 1.6));
            ctx.stroke();
        }

        // value arc
        if (share > 0.001) {
            const end = START + SWEEP * share;
            const gradient = ctx.createLinearGradient(cx - radius, cy + radius, cx + radius, cy - radius);
            gradient.addColorStop(0, withAlpha(color, 0.55));
            gradient.addColorStop(1, color);
            const pulse = item.status === 'crit' && !env.still ? 0.6 + 0.4 * Math.sin(env.time / 260) : 1;
            glow(ctx, color, (hovered ? 26 : 16) * pulse, palette);
            ctx.lineWidth = thickness;
            ctx.strokeStyle = gradient;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, START, end);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = palette.name === 'dark' ? '#ffffff' : color;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, thickness * 0.32, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // centre value
        const valueText = Number.isFinite(item.value) ? formatNumber(shown, o.decimals) : '–';
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.text;
        const valueSize = fitText(ctx, valueText, radius * 1.35, radius * 0.62, 700, 9);
        const unitSize = Math.max(8, valueSize * 0.42);
        ctx.font = font(valueSize, 700);
        const valueWidth = ctx.measureText(valueText).width;
        ctx.font = font(unitSize, 600);
        const unitWidth = item.unit ? ctx.measureText(item.unit).width + 2 : 0;
        const startX = cx - (valueWidth + unitWidth) / 2;
        ctx.textAlign = 'left';
        ctx.font = font(valueSize, 700);
        ctx.fillText(valueText, startX, cy - radius * 0.06);
        if (item.unit) {
            ctx.fillStyle = palette.muted;
            ctx.font = font(unitSize, 600);
            ctx.fillText(item.unit, startX + valueWidth + 2, cy - radius * 0.06 + valueSize * 0.12);
        }
        if (radius > 26) {
            ctx.textAlign = 'center';
            ctx.font = font(clamp(radius * 0.17, 8, 12), 700);
            ctx.fillStyle = item.status === 'none' ? palette.muted : color;
            ctx.fillText(STATUS_LABEL[item.status].toUpperCase(), cx, cy + radius * 0.42);
        }

        // label
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.text;
        ctx.font = font(labelSize, 600);
        ctx.fillText(ellipsize(ctx, item.name, cellW - 10), cx, cy + radius * 0.85 + labelSpace / 2);
        ctx.restore();

        const tooltip = [item.name, `${Number.isFinite(item.value) ? formatNumber(item.value, o.decimals) : 'keine Daten'}${item.unit ? ` ${item.unit}` : ''} · ${STATUS_LABEL[item.status]}`];
        tooltip.push(`Schwellen: auffaellig ${item.higher ? '≤' : '≥'} ${item.warn}, kritisch ${item.higher ? '≤' : '≥'} ${item.crit}`);
        if (item.detail) tooltip.push(item.detail);
        if (o.clickHint && env.mode !== 'edit') tooltip.push(o.clickHint);
        hits.push({
            id: `ring:${item.id}`,
            cx,
            cy,
            r: radius + thickness,
            label: `${item.name}: ${valueText}${item.unit ? ` ${item.unit}` : ''}, ${STATUS_LABEL[item.status]}`,
            tooltip,
            payload: { name: o.drilldownToken, value: item.key },
        });
    });
    return hits;
}
