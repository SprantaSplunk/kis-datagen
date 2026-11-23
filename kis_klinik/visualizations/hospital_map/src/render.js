import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, fitText, font, glow, lerp, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const STATUS_DE = { ok: 'normal', warn: 'angespannt', crit: 'kritisch', none: 'keine Daten' };

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const count = model.buildings.length;
    const gap = clamp(width * 0.018, 6, 22);
    const colW = (width - gap * (count + 1)) / count;
    const headH = clamp(height * 0.12, 22, 46);
    const prev = new Map((env.previous?.wards || []).map((w) => [w.id, w.pct]));
    const titleSize = Math.min(...model.buildings.map((b) => fitText(ctx, b.name, colW - 20, clamp(headH * 0.42, 9, 16), 700)));

    model.buildings.forEach((b, bi) => {
        const x = gap + bi * (colW + gap);
        const top = gap * 0.6;
        const bodyH = height - top - gap * 0.6;
        const crit = b.critical > 0;

        // building outline with roof
        ctx.save();
        ctx.fillStyle = withAlpha(palette.name === 'dark' ? '#0b1630' : '#ffffff', palette.name === 'dark' ? 0.75 : 0.9);
        ctx.strokeStyle = crit ? statusColor(palette, 'crit') : palette.panelEdge;
        ctx.lineWidth = crit ? 2 : 1;
        if (crit && !env.still) glow(ctx, statusColor(palette, 'crit'), 10 + 6 * Math.sin(env.time / 300), palette);
        roundRect(ctx, x, top, colW, bodyH, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = palette.text;
        ctx.textBaseline = 'middle';
        ctx.font = font(titleSize, 700);
        ctx.fillText(ellipsize(ctx, b.name, colW - 20), x + 10, top + headH * 0.42);
        ctx.font = font(clamp(headH * 0.3, 8, 12), 600);
        ctx.fillStyle = palette.muted;
        ctx.fillText(`${formatNumber(b.free, 0)} frei / ${formatNumber(b.total, 0)} Betten`, x + 10, top + headH * 0.82);
        ctx.restore();

        const buildingHit = { id: `bld:${b.code}`, x, y: top, w: colW, h: headH, label: `${b.name}: ${b.free} freie Betten`,
            tooltip: [b.name, `${b.free} freie von ${b.total} Betten`, `${b.critical} Stationen kritisch`],
            payload: o.drillField === 'building' ? { name: o.drilldownToken, value: b.code } : null };
        if (buildingHit.payload) hits.push(buildingHit);
        else hits.push({ ...buildingHit, hover: true, payload: undefined });

        // wards grouped by floor, top floor first
        const floors = [...new Set(b.wards.map((w) => w.floor))];
        const areaY = top + headH + 4;
        const areaH = bodyH - headH - 10;
        const floorH = areaH / Math.max(1, floors.length);
        floors.forEach((floor, fi) => {
            const list = b.wards.filter((w) => w.floor === floor);
            const fy = areaY + fi * floorH;
            ctx.save();
            ctx.fillStyle = palette.faint;
            ctx.font = font(clamp(floorH * 0.18, 7, 11), 600);
            ctx.textBaseline = 'middle';
            ctx.fillText(floor === 0 ? 'EG' : `${floor}.OG`, x + 8, fy + floorH / 2);
            ctx.restore();
            const labelW = clamp(colW * 0.1, 22, 36);
            const tileGap = 5;
            const tileW = (colW - labelW - 12 - tileGap * (list.length - 1)) / list.length;
            list.forEach((w, wi) => {
                const tx = x + labelW + 4 + wi * (tileW + tileGap);
                const ty = fy + 3;
                const th = floorH - 6;
                const color = statusColor(palette, w.status);
                const hovered = env.hoverId === `ward:${w.id}`;
                const from = prev.has(w.id) && Number.isFinite(prev.get(w.id)) ? prev.get(w.id) : 0;
                const shown = Number.isFinite(w.pct) ? lerp(from, w.pct, env.progress) : 0;
                ctx.save();
                ctx.fillStyle = palette.track;
                roundRect(ctx, tx, ty, tileW, th, 6);
                ctx.fill();
                // occupancy fill from the bottom
                const fillH = th * clamp(shown / 100, 0, 1);
                ctx.save();
                roundRect(ctx, tx, ty, tileW, th, 6);
                ctx.clip();
                const grad = ctx.createLinearGradient(0, ty + th, 0, ty);
                grad.addColorStop(0, withAlpha(color, 0.75));
                grad.addColorStop(1, withAlpha(color, 0.35));
                ctx.fillStyle = grad;
                ctx.fillRect(tx, ty + th - fillH, tileW, fillH);
                ctx.restore();
                ctx.strokeStyle = hovered ? palette.focus : withAlpha(color, 0.9);
                ctx.lineWidth = hovered ? 2 : 1;
                if (w.status === 'crit' && !env.still) glow(ctx, color, 8 + 6 * Math.sin(env.time / 260), palette);
                roundRect(ctx, tx, ty, tileW, th, 6);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = palette.text;
                const nameSize = fitText(ctx, w.ward, tileW - 6, clamp(th * 0.26, 7, 14), 700, 6);
                ctx.font = font(nameSize, 700);
                if (th > 22) ctx.fillText(w.ward, tx + tileW / 2, ty + th * (o.showFree && th > 34 ? 0.34 : 0.5));
                if (o.showFree && th > 34) {
                    const freeText = Number.isFinite(w.free) ? `${formatNumber(w.free, 0)} frei` : '–';
                    ctx.font = font(fitText(ctx, freeText, tileW - 6, clamp(th * 0.22, 7, 13), 600, 6), 600);
                    ctx.fillStyle = w.free <= 0 ? color : palette.muted;
                    ctx.fillText(freeText, tx + tileW / 2, ty + th * 0.7);
                }
                ctx.restore();
                const value = o.drillField === 'ward' ? w.ward : o.drillField === 'building' ? w.building : w.dept;
                hits.push({
                    id: `ward:${w.id}`,
                    x: tx,
                    y: ty,
                    w: tileW,
                    h: th,
                    label: `${w.name}: ${formatNumber(w.pct, 0)} Prozent belegt, ${formatNumber(w.free, 0)} frei`,
                    tooltip: [
                        w.name,
                        `Belegung ${formatNumber(w.pct, 1)} % · ${STATUS_DE[w.status]}`,
                        `${formatNumber(w.occupied, 0)} belegt · ${formatNumber(w.free, 0)} frei · ${formatNumber(w.total, 0)} gesamt`,
                        `Abteilung ${w.dept} · ${w.floor === 0 ? 'EG' : `${w.floor}. OG`}`,
                    ],
                    payload: { name: o.drilldownToken, value },
                });
            });
        });
    });
    return hits;
}
