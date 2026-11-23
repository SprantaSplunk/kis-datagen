import { clamp } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const STATUS_DE = { ok: 'in Betrieb', warn: 'betroffen', crit: 'ausgefallen', none: 'unbekannt' };

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const L = model.layers.length;
    const headH = clamp(height * 0.06, 12, 22);
    const colW = width / L;
    const pos = new Map();
    const maxRows = Math.max(...model.layers.map((l) => l.nodes.length));
    const nodeH = clamp((height - headH - 10) / Math.max(1, maxRows) - 4, 8, 34);

    model.layers.forEach((layer, li) => {
        const x = li * colW + colW * 0.1;
        const w = colW * 0.8;
        const rowH = (height - headH - 10) / layer.nodes.length;
        layer.nodes.forEach((n, ni) => {
            const y = headH + 6 + ni * rowH + (rowH - nodeH) / 2;
            pos.set(n.id, { x, y, w, h: nodeH });
        });
        ctx.save();
        ctx.fillStyle = palette.muted;
        ctx.font = font(fitText(ctx, layer.label, colW - 6, clamp(headH * 0.65, 7, 12), 700, 6), 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${layer.label}${layer.hidden ? ` (+${layer.hidden})` : ''}`, li * colW + colW / 2, headH / 2);
        ctx.restore();
    });

    const hoverNode = env.hoverId && env.hoverId.startsWith('ci:') ? env.hoverId.slice(3) : null;
    const related = new Set();
    if (hoverNode) {
        related.add(hoverNode);
        // walk both directions so the whole dependency chain lights up
        let frontier = [hoverNode];
        for (let depth = 0; depth < 6 && frontier.length; depth += 1) {
            const next = [];
            for (const e of model.edges) {
                if (frontier.includes(e.from) && !related.has(e.to)) {
                    related.add(e.to);
                    next.push(e.to);
                }
                if (frontier.includes(e.to) && !related.has(e.from)) {
                    related.add(e.from);
                    next.push(e.from);
                }
            }
            frontier = next;
        }
    }

    // edges
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    ctx.save();
    for (const e of model.edges) {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const left = a.x <= b.x ? a : b;
        const right = a.x <= b.x ? b : a;
        const x1 = left.x + left.w;
        const y1 = left.y + left.h / 2;
        const x2 = right.x;
        const y2 = right.y + right.h / 2;
        const bad = [byId.get(e.from), byId.get(e.to)].some((n) => n && n.own === 'crit');
        const lit = hoverNode && related.has(e.from) && related.has(e.to);
        ctx.strokeStyle = lit ? palette.accent : bad ? withAlpha(statusColor(palette, 'crit'), 0.7) : withAlpha(palette.muted, hoverNode ? 0.08 : 0.22);
        ctx.lineWidth = lit ? 2 : bad ? 1.6 : 1;
        if (x2 - x1 < 4) {
            ctx.beginPath();
            ctx.moveTo(left.x + left.w / 2, y1);
            ctx.lineTo(right.x + right.w / 2, y2);
            ctx.stroke();
            continue;
        }
        const mx = (x1 + x2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        ctx.stroke();
        if (bad && !env.still) {
            const t = (env.time / 1600) % 1;
            const u = 1 - t;
            const px = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
            const py = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
            ctx.fillStyle = statusColor(palette, 'crit');
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();

    // nodes
    for (const n of model.nodes) {
        const p = pos.get(n.id);
        if (!p) continue;
        const color = statusColor(palette, n.status);
        const dim = hoverNode && !related.has(n.id);
        const hovered = hoverNode === n.id;
        ctx.save();
        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.fillStyle = palette.name === 'dark' ? 'rgba(10, 18, 36, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = hovered ? palette.focus : n.status === 'ok' ? palette.panelEdge : color;
        ctx.lineWidth = hovered ? 2.4 : n.status === 'ok' ? 1 : 2;
        if (n.own === 'crit' && !env.still) glow(ctx, color, 10 + 6 * Math.sin(env.time / 260), palette);
        roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(8, p.h / 2));
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x + p.h / 2, p.y + p.h / 2, clamp(p.h * 0.2, 2, 5), 0, Math.PI * 2);
        ctx.fill();
        if (p.h >= 10) {
            ctx.fillStyle = palette.text;
            ctx.font = font(clamp(p.h * 0.48, 7, 13), 600);
            ctx.textBaseline = 'middle';
            ctx.fillText(ellipsize(ctx, n.id, p.w - p.h - 6), p.x + p.h, p.y + p.h / 2 + 0.5);
        }
        ctx.restore();
        const deps = model.edges.filter((e) => e.from === n.id).length;
        const users = model.edges.filter((e) => e.to === n.id).length;
        hits.push({
            id: `ci:${n.id}`,
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
            label: `${n.id}: ${STATUS_DE[n.status]}`,
            tooltip: [n.id, `${n.type || 'CI'} · ${STATUS_DE[n.status]}${n.impacted && n.own !== 'crit' ? ' (durch Abhaengigkeit)' : ''}`, `${deps} Abhaengigkeiten · ${users} Nutzer`],
            payload: { name: o.drilldownToken, value: n.id },
        });
    }
    return hits;
}
