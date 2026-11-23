import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, font, glow, lerpColor, roundRect } from '../../../shared/draw.js';
import { STATUS_LABEL, statusColor, statusOf } from '../../../shared/theme.js';

const HEAT_DARK = ['#0f2a4a', '#1477b8', '#22d3ee', '#ffc53d', '#ff4d6d'];
const HEAT_LIGHT = ['#dbe8f3', '#7fb3d5', '#006d9c', '#9a5b00', '#c8102e'];

function ramp(stops, t) {
    const scaled = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    return lerpColor(stops[i], stops[i + 1], scaled - i);
}

function badness(model, value) {
    const span = model.max - model.min;
    // square root keeps small values visible next to a single large outlier
    const t = span > 0 ? Math.sqrt(clamp((value - model.min) / span, 0, 1)) : 0.5;
    return model.options.higherIsBetter ? 1 - t : t;
}

function cellColor(model, value, palette) {
    const o = model.options;
    if (o.scaleMode === 'thresholds') {
        const status = statusOf(value, o.warn, o.crit, o.higherIsBetter);
        return { color: statusColor(palette, status), status, alpha: status === 'ok' ? 0.45 : 0.9 };
    }
    const stops = palette.name === 'dark' ? HEAT_DARK : HEAT_LIGHT;
    return { color: ramp(stops, badness(model, value)), status: null, alpha: 1 };
}

function formatTime(ms, spanMs) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return spanMs > 36 * 3600 * 1000 ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${hm}` : hm;
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const unit = o.unit ? ` ${o.unit}` : '';
    const rows = model.series.length;
    const cols = model.timeline.length;
    const span = model.timeline[cols - 1] - model.timeline[0];
    const legendH = height > 150 ? 22 : 0;
    const axisH = height > 110 ? 18 : 0;
    const gridY = 2;
    const gridH = Math.max(10, height - axisH - legendH - 6);
    const rowH = gridH / rows;
    const labelSize = clamp(rowH * 0.42, 9, 13);
    ctx.font = font(labelSize, 800);
    const longest = Math.max(...model.series.map((s) => ctx.measureText(s.name).width));
    const labelW = clamp(longest + 18, 50, Math.max(60, width * 0.28));
    const gridX = labelW;
    const gridW = Math.max(20, width - labelW - 6);
    const colW = gridW / cols;
    const gap = colW > 6 && rowH > 6 ? 1.5 : 0;
    const hits = [];
    const sweep = env.progress;

    model.series.forEach((series, r) => {
        const y = gridY + r * rowH;
        const rowHover = env.hoverId === `row:${r}`;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.font = font(labelSize, rowHover ? 800 : 600);
        ctx.fillStyle = rowHover ? palette.accent : palette.text;
        ctx.fillText(ellipsize(ctx, series.name, labelW - 16), 4, y + rowH / 2);
        ctx.restore();

        series.values.forEach((value, c) => {
            const x = gridX + c * colW;
            const reveal = clamp(sweep * (cols + 6) - c, 0, 1);
            if (!Number.isFinite(value)) {
                ctx.fillStyle = palette.track;
                ctx.globalAlpha = 0.5 * reveal;
                ctx.fillRect(x + gap / 2, y + gap / 2, colW - gap, rowH - gap);
                ctx.globalAlpha = 1;
                return;
            }
            const { color, status, alpha } = cellColor(model, value, palette);
            const hot = status ? status === 'crit' : badness(model, value) > 0.85;
            ctx.save();
            ctx.globalAlpha = alpha * reveal;
            if (hot) glow(ctx, color, 10, palette);
            ctx.fillStyle = color;
            if (colW - gap > 5 && rowH - gap > 5) {
                roundRect(ctx, x + gap / 2, y + gap / 2, colW - gap, rowH - gap, Math.min(3, colW / 4));
                ctx.fill();
            } else {
                ctx.fillRect(x + gap / 2, y + gap / 2, colW - gap, rowH - gap);
            }
            ctx.restore();
            hits.push({
                id: `cell:${r}:${c}`,
                hover: true,
                x,
                y,
                w: colW,
                h: rowH,
                tooltip: [
                    series.name,
                    `${formatTime(model.timeline[c], span)}${model.step ? ` – ${formatTime(model.timeline[c] + model.step, span)}` : ''}`,
                    `${formatNumber(value, o.decimals)}${unit}${status ? ` · ${STATUS_LABEL[status]}` : ''}`,
                ],
            });
        });

        if (rowHover) {
            ctx.save();
            ctx.strokeStyle = palette.focus;
            ctx.lineWidth = 1.5;
            roundRect(ctx, gridX - 1, y, gridW + 2, rowH, 4);
            ctx.stroke();
            ctx.restore();
        }

        const tooltip = [series.name];
        if (Number.isFinite(series.last)) tooltip.push(`Latest: ${formatNumber(series.last, o.decimals)}${unit}`);
        if (Number.isFinite(series.worst)) tooltip.push(`${o.higherIsBetter ? 'Lowest' : 'Highest'}: ${formatNumber(series.worst, o.decimals)}${unit}`);
        hits.push({
            id: `row:${r}`,
            x: 0,
            y,
            w: width,
            h: rowH,
            label: `${series.name}: ${tooltip.slice(1).join(', ') || 'no values'}`,
            tooltip,
            payload: { name: o.drilldownToken, value: series.name },
        });
    });

    // time axis
    if (axisH) {
        ctx.save();
        ctx.fillStyle = palette.muted;
        ctx.font = font(10, 500);
        ctx.textBaseline = 'top';
        const sample = formatTime(model.timeline[0], span);
        const every = Math.max(1, Math.ceil(((ctx.measureText(sample).width + 18) * cols) / gridW));
        for (let c = 0; c < cols; c += every) {
            const x = gridX + c * colW + colW / 2;
            ctx.textAlign = c === 0 ? 'left' : 'center';
            ctx.fillText(formatTime(model.timeline[c], span), c === 0 ? gridX : x, gridY + gridH + 4);
        }
        ctx.restore();
    }

    // legend
    if (legendH) {
        ctx.save();
        const ly = height - legendH + 6;
        ctx.font = font(10, 600);
        ctx.textBaseline = 'middle';
        if (o.scaleMode === 'thresholds') {
            let lx = gridX;
            const cmp = o.higherIsBetter ? '≤' : '≥';
            for (const [status, text] of [
                ['ok', STATUS_LABEL.ok],
                ['warn', `${STATUS_LABEL.warn} ${cmp} ${o.warn}${unit}`],
                ['crit', `${STATUS_LABEL.crit} ${cmp} ${o.crit}${unit}`],
            ]) {
                ctx.fillStyle = statusColor(palette, status);
                roundRect(ctx, lx, ly - 5, 14, 10, 2);
                ctx.fill();
                ctx.fillStyle = palette.muted;
                ctx.fillText(text, lx + 19, ly);
                lx += ctx.measureText(text).width + 40;
            }
        } else {
            const stops = palette.name === 'dark' ? HEAT_DARK : HEAT_LIGHT;
            const barW = Math.min(180, gridW * 0.4);
            const low = formatNumber(model.min, o.decimals) + unit;
            const high = formatNumber(model.max, o.decimals) + unit;
            ctx.fillStyle = palette.muted;
            ctx.fillText(low, gridX, ly);
            const bx = gridX + ctx.measureText(low).width + 8;
            for (let i = 0; i < barW; i += 2) {
                const t = i / barW;
                ctx.fillStyle = ramp(stops, o.higherIsBetter ? 1 - t : t);
                ctx.fillRect(bx + i, ly - 4, 2, 8);
            }
            ctx.fillStyle = palette.muted;
            ctx.fillText(high, bx + barW + 8, ly);
        }
        if (model.hidden) {
            ctx.textAlign = 'right';
            ctx.fillText(`+${model.hidden} more series`, width - 6, ly);
        }
        ctx.restore();
    }
    return hits;
}
