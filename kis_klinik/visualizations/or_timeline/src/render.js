import { clamp, formatNumber } from '../../../shared/data.js';
import { ellipsize, font, glow, roundRect, withAlpha } from '../../../shared/draw.js';
import { statusColor } from '../../../shared/theme.js';

const DEPT_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#2dd4bf', '#e879f9'];

function hhmm(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function draw(ctx, width, height, model, env) {
    const palette = env.palette;
    const o = model.options;
    const hits = [];
    const labelW = clamp(width * 0.08, 40, 90);
    const axisH = clamp(height * 0.08, 14, 24);
    const plotW = Math.max(10, width - labelW - 8);
    const rowH = (height - axisH - 4) / model.rooms.length;
    const span = model.end - model.start;
    const xOf = (t) => labelW + ((t - model.start) / span) * plotW;
    const depts = [...new Set(model.cases.map((c) => c.dept).filter(Boolean))].sort();
    const deptColor = (d) => DEPT_COLORS[Math.max(0, depts.indexOf(d)) % DEPT_COLORS.length];
    const chosen = o.drillField === 'room' && env.token ? env.token(o.drilldownToken) : undefined;
    const selectedRoom = model.rooms.includes(chosen) ? chosen : null;
    const roomPayload = (room) => ({ name: o.drilldownToken, value: room === selectedRoom ? '*' : room });
    const roomHint = (room) => (room === selectedRoom ? 'Klick zeigt wieder alle Saele' : `Klick zeigt die Faelle von Saal ${room}`);

    // hour grid
    ctx.save();
    ctx.font = font(clamp(axisH * 0.55, 8, 12), 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hours = span / 3600000;
    const step = hours > 16 ? 3 : hours > 8 ? 2 : 1;
    for (let t = model.start; t <= model.end; t += 3600000 * step) {
        const x = xOf(t);
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(x, axisH);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillStyle = palette.muted;
        if (x > labelW + 10 && x < width - 10) ctx.fillText(hhmm(t), x, axisH / 2);
    }
    ctx.restore();

    model.rooms.forEach((room, ri) => {
        const y = axisH + ri * rowH;
        const selected = room === selectedRoom;
        const roomHovered = env.hoverId === `room:${room}`;
        ctx.save();
        // dim the other rooms while one is selected
        ctx.globalAlpha = selectedRoom && !selected && !roomHovered ? 0.35 : 1;
        if (selected) {
            ctx.fillStyle = withAlpha(palette.accent, 0.14);
            ctx.fillRect(0, y, width, rowH);
            ctx.fillStyle = palette.accent;
            ctx.fillRect(0, y, 4, rowH);
        } else if (ri % 2 === 0) {
            ctx.fillStyle = palette.track;
            ctx.fillRect(labelW, y, plotW, rowH);
        }
        ctx.fillStyle = selected ? palette.accent : palette.text;
        ctx.font = font(clamp(rowH * 0.42, 8, 14), selected ? 800 : 700);
        ctx.textBaseline = 'middle';
        ctx.fillText(room, 8, y + rowH / 2);

        if (o.drillField === 'room') {
            hits.push({ id: `room:${room}`, x: 0, y, w: width, h: rowH,
                label: `Saal ${room}${selected ? ' (Auswahl aktiv)' : ''}`, tooltip: [`Saal ${room}`, roomHint(room)],
                payload: roomPayload(room) });
            if (roomHovered) {
                ctx.strokeStyle = palette.focus;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(1, y + 1, width - 2, rowH - 2);
            }
        }

        for (const c of model.cases.filter((x) => x.room === room)) {
            const px = xOf(c.ps);
            const pw = Math.max(2, xOf(c.pe) - px);
            const by = y + rowH * 0.16;
            const bh = rowH * 0.68;
            const color = deptColor(c.dept);
            const hovered = env.hoverId === `case:${c.id}`;
            ctx.save();
            // planned slot
            ctx.strokeStyle = withAlpha(color, 0.8);
            ctx.setLineDash(c.cancelled ? [3, 3] : []);
            ctx.lineWidth = 1;
            roundRect(ctx, px, by, pw, bh, 4);
            ctx.stroke();
            ctx.setLineDash([]);
            if (c.cancelled) {
                ctx.strokeStyle = statusColor(palette, 'crit');
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, by);
                ctx.lineTo(px + pw, by + bh);
                ctx.moveTo(px, by + bh);
                ctx.lineTo(px + pw, by);
                ctx.stroke();
            } else if (Number.isFinite(c.as)) {
                const now = Date.now();
                const endT = Number.isFinite(c.ae) ? c.ae : Math.min(Math.max(now, c.as), c.pe + (c.as - c.ps));
                const ax = xOf(c.as);
                const aw = Math.max(2, xOf(endT) - ax);
                ctx.fillStyle = withAlpha(color, Number.isFinite(c.ae) ? 0.55 : 0.85);
                if (!Number.isFinite(c.ae) && !env.still) glow(ctx, color, 8, palette);
                roundRect(ctx, ax, by + bh * 0.18, aw, bh * 0.64, 3);
                ctx.fill();
                ctx.shadowBlur = 0;
                if (c.status !== 'ok') {
                    ctx.fillStyle = statusColor(palette, c.status);
                    ctx.beginPath();
                    ctx.arc(ax, by + bh / 2, clamp(bh * 0.16, 2, 5), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            if (hovered) {
                ctx.strokeStyle = palette.focus;
                ctx.lineWidth = 2;
                roundRect(ctx, px - 2, by - 2, pw + 4, bh + 4, 5);
                ctx.stroke();
            }
            if (pw > 46 && bh > 12) {
                ctx.fillStyle = palette.text;
                ctx.font = font(clamp(bh * 0.36, 7, 12), 600);
                ctx.textBaseline = 'middle';
                ctx.fillText(ellipsize(ctx, c.procedure, pw - 8), px + 4, by + bh / 2);
            }
            ctx.restore();
            const tooltip = [c.procedure, `Saal ${c.room}${c.dept ? ` · ${c.dept}` : ''} · ${c.id}`, `Geplant ${hhmm(c.ps)}–${hhmm(c.pe)}`];
            if (c.cancelled) tooltip.push('Abgesetzt');
            else if (Number.isFinite(c.as)) tooltip.push(`Beginn ${hhmm(c.as)}${Number.isFinite(c.ae) ? ` · Ende ${hhmm(c.ae)}` : ' · laeuft'} · ${c.delay > 0 ? `+${formatNumber(c.delay, 0)} min` : 'puenktlich'}`);
            if (o.drillField === 'room') tooltip.push(roomHint(c.room));
            const value = o.drillField === 'case' ? c.id : o.drillField === 'department' ? c.dept || c.room : c.room;
            hits.push({
                id: `case:${c.id}`,
                x: px,
                y: by,
                w: pw,
                h: bh,
                label: `${c.procedure} in Saal ${c.room}, geplant ${hhmm(c.ps)}${c.cancelled ? ', abgesetzt' : ''}`,
                tooltip,
                payload: o.drillField === 'room' ? roomPayload(c.room) : { name: o.drilldownToken, value },
            });
        }
        ctx.restore();
    });

    if (o.showNow) {
        const now = Math.floor(Date.now() / 60000) * 60000;
        if (now >= model.start && now <= model.end) {
            const x = xOf(now);
            ctx.save();
            ctx.strokeStyle = palette.accent;
            ctx.lineWidth = 2;
            glow(ctx, palette.accent, 6, palette);
            ctx.beginPath();
            ctx.moveTo(x, axisH);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.restore();
        }
    }
    return hits;
}
