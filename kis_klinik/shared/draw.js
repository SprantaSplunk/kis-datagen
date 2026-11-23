import { FONT } from './theme.js';

export function prepareCanvas(canvas, width, height) {
    if (!(width > 0 && height > 0)) return null;
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return context;
}

export function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

export function font(size, weight = 500, family = FONT) {
    return `${weight} ${Math.max(6, Math.round(size))}px ${family}`;
}

// shrink text size until it fits maxWidth; returns the chosen size
export function fitText(ctx, text, maxWidth, maxSize, weight = 500, minSize = 8, family = FONT) {
    let size = maxSize;
    ctx.font = font(size, weight, family);
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = font(size, weight, family);
    }
    return size;
}

export function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
    return `${text.slice(0, end)}…`;
}

export function withAlpha(hex, alpha) {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return hex;
    const value = Number.parseInt(match[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function lerpColor(a, b, t) {
    const pa = Number.parseInt(a.slice(1), 16);
    const pb = Number.parseInt(b.slice(1), 16);
    const channel = (shift) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, t));
    return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function glow(ctx, color, blur, palette) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * (palette?.glow ?? 1);
}

export function drawMessage(ctx, width, height, message, palette) {
    ctx.save();
    ctx.fillStyle = palette.muted;
    ctx.font = font(Math.min(15, Math.max(11, width / 30)), 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
    ctx.restore();
}

export function drawLoadingBadge(ctx, width, palette, time) {
    ctx.save();
    const x = width - 14;
    const y = 12;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const start = (time / 300) % (Math.PI * 2);
    ctx.beginPath();
    ctx.arc(x, y, 5, start, start + Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
}

export function focusRing(ctx, hit, palette) {
    ctx.save();
    ctx.strokeStyle = palette.focus;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    if (hit.r) {
        ctx.beginPath();
        ctx.arc(hit.cx, hit.cy, hit.r + 4, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        roundRect(ctx, hit.x - 3, hit.y - 3, hit.w + 6, hit.h + 6, 6);
        ctx.stroke();
    }
    ctx.restore();
}

export function hitTest(hits, x, y) {
    for (let i = hits.length - 1; i >= 0; i -= 1) {
        const hit = hits[i];
        if (hit.r) {
            const dx = x - hit.cx;
            const dy = y - hit.cy;
            if (dx * dx + dy * dy <= (hit.r + 4) * (hit.r + 4)) return hit;
        } else if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
            return hit;
        }
    }
    return null;
}

export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}
