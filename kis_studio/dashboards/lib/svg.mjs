// SVG artwork for the dashboards: page backgrounds with glass panels and navigation buttons.
// Everything is generated, so titles, panel frames and buttons stay aligned with the layout.

export const FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export function esc(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function rng(seed) {
    let state = 0;
    for (const ch of seed) state = (state * 31 + ch.charCodeAt(0)) >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

const r1 = (n) => Math.round(n * 10) / 10;

function motif(domain, width, height, accent, random) {
    const parts = [];
    const right = width - 40;
    switch (domain.motif) {
        case 'orbit': {
            for (let i = 0; i < 6; i += 1) {
                parts.push(`<ellipse cx="${right - 260}" cy="70" rx="${180 + i * 70}" ry="${60 + i * 26}" fill="none" stroke="${accent}" stroke-opacity="${0.16 - i * 0.02}" stroke-width="1.2" transform="rotate(-12 ${right - 260} 70)"/>`);
            }
            for (let i = 0; i < 26; i += 1) {
                const a = random() * Math.PI * 2;
                const k = 180 + Math.floor(random() * 6) * 70;
                parts.push(`<circle cx="${r1(right - 260 + Math.cos(a) * k)}" cy="${r1(70 + Math.sin(a) * k * 0.36)}" r="${r1(1.2 + random() * 2.2)}" fill="${accent}" fill-opacity="${r1(0.25 + random() * 0.5)}"/>`);
            }
            break;
        }
        case 'hex': {
            const s = 34;
            for (let row = 0; row < 6; row += 1) {
                for (let col = 0; col < 14; col += 1) {
                    if (random() < 0.35) continue;
                    const cx = right - col * s * 1.5 - (row % 2) * s * 0.75;
                    const cy = 10 + row * s * 0.87;
                    const pts = Array.from({ length: 6 }, (_, k) => {
                        const a = (Math.PI / 3) * k;
                        return `${r1(cx + Math.cos(a) * s * 0.48)},${r1(cy + Math.sin(a) * s * 0.48)}`;
                    }).join(' ');
                    parts.push(`<polygon points="${pts}" fill="${random() < 0.12 ? accent : 'none'}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="${r1(0.08 + random() * 0.18)}" stroke-width="1.2"/>`);
                }
            }
            break;
        }
        case 'circuit': {
            for (let i = 0; i < 18; i += 1) {
                let x = right - random() * 700;
                let y = 8 + random() * 170;
                let d = `M${r1(x)} ${r1(y)}`;
                for (let k = 0; k < 3; k += 1) {
                    if (k % 2 === 0) x -= 40 + random() * 140;
                    else y += (random() < 0.5 ? -1 : 1) * (20 + random() * 40);
                    d += ` L${r1(x)} ${r1(Math.max(4, Math.min(190, y)))}`;
                }
                parts.push(`<path d="${d}" fill="none" stroke="${accent}" stroke-opacity="${r1(0.12 + random() * 0.2)}" stroke-width="1.4"/>`);
                parts.push(`<circle cx="${r1(x)}" cy="${r1(Math.max(4, Math.min(190, y)))}" r="3" fill="${accent}" fill-opacity="0.5"/>`);
            }
            break;
        }
        case 'mesh': {
            const nodes = Array.from({ length: 22 }, () => [right - random() * 820, 10 + random() * 180]);
            nodes.forEach(([x, y], i) => {
                nodes.slice(i + 1).forEach(([x2, y2]) => {
                    const dist = Math.hypot(x - x2, y - y2);
                    if (dist < 170) parts.push(`<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${accent}" stroke-opacity="${r1(0.24 - dist / 900)}" stroke-width="1"/>`);
                });
            });
            nodes.forEach(([x, y]) => parts.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1.8 + random() * 2.4)}" fill="${accent}" fill-opacity="0.6"/>`));
            break;
        }
        case 'wave': {
            for (let i = 0; i < 7; i += 1) {
                let d = '';
                for (let x = 0; x <= 900; x += 12) {
                    const y = 100 + Math.sin(x / (60 + i * 9) + i) * (18 + i * 7) * Math.sin((x / 900) * Math.PI);
                    d += `${x === 0 ? 'M' : 'L'}${r1(right - 900 + x)} ${r1(y)} `;
                }
                parts.push(`<path d="${d}" fill="none" stroke="${accent}" stroke-opacity="${r1(0.3 - i * 0.035)}" stroke-width="1.5"/>`);
            }
            break;
        }
        case 'ecg': {
            // monitor trace with QRS complexes, plus a faint medical cross
            for (let i = 0; i < 3; i += 1) {
                let d = '';
                const base = 70 + i * 46;
                for (let x = 0; x <= 960; x += 4) {
                    const p = ((x + i * 70) % 160) / 160;
                    let y = 0;
                    if (p > 0.3 && p < 0.33) y = -8;
                    else if (p >= 0.33 && p < 0.37) y = 46 - i * 10;
                    else if (p >= 0.37 && p < 0.41) y = -16;
                    else if (p > 0.55 && p < 0.7) y = 9 * Math.sin(((p - 0.55) / 0.15) * Math.PI);
                    d += `${x === 0 ? 'M' : 'L'}${r1(right - 960 + x)} ${r1(base - y)} `;
                }
                parts.push(`<path d="${d}" fill="none" stroke="${accent}" stroke-opacity="${r1(0.34 - i * 0.09)}" stroke-width="1.6"/>`);
            }
            const cx = right - 120;
            parts.push(`<path d="M${cx - 18} 30 h36 v36 h36 v36 h-36 v36 h-36 v-36 h-36 v-36 h36 z" fill="${accent}" fill-opacity="0.07"/>`);
            break;
        }
        case 'code': {
            for (let i = 0; i < 12; i += 1) {
                const y = 16 + i * 15;
                let x = right - 760 + random() * 80;
                while (x < right) {
                    const w = 18 + random() * 90;
                    parts.push(`<rect x="${r1(x)}" y="${y}" width="${r1(Math.min(w, right - x))}" height="5" rx="2.5" fill="${random() < 0.2 ? accent : '#9fb1c9'}" fill-opacity="${r1(0.06 + random() * 0.14)}"/>`);
                    x += w + 10 + random() * 30;
                }
            }
            break;
        }
        default: {
            for (let i = 0; i < 9; i += 1) {
                const x = right - 120 - i * 90;
                parts.push(`<polygon points="${x},0 ${x + 46},0 ${x - 160},210 ${x - 206},210" fill="${accent}" fill-opacity="${r1(0.03 + random() * 0.05)}"/>`);
            }
        }
    }
    return parts.join('\n    ');
}

// panels: [{ x, y, w, h, title, accent? }]
export function background({ id, width, height, domain, title, subtitle, kicker, panels, sections = [] }) {
    const random = rng(id);
    const accent = domain.accent;
    const accent2 = domain.accent2;
    const panelSvg = panels
        .map((p) => {
            const tone = p.accent || accent;
            const title = p.title
                ? `<rect x="${p.x + 20}" y="${p.y + 16}" width="4" height="16" rx="2" fill="${tone}"/>
    <text x="${p.x + 32}" y="${p.y + 29}" class="pt">${esc(p.title.toUpperCase())}</text>${p.hint ? `\n    <text x="${p.x + p.w - 20}" y="${p.y + 29}" class="ph" text-anchor="end">${esc(p.hint)}</text>` : ''}`
                : '';
            return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="18" fill="url(#glass)" stroke="url(#edge)" stroke-width="1.2"/>
    <rect x="${p.x + 18}" y="${p.y}" width="${Math.min(120, p.w - 36)}" height="2" rx="1" fill="${tone}" fill-opacity="0.85"/>
    ${title}`;
        })
        .join('\n    ');
    const sectionSvg = sections
        .map((s) => `<text x="${s.x}" y="${s.y}" class="sec">${esc(s.label.toUpperCase())}</text>
    <line x1="${s.x + s.label.length * 9.4 + 18}" y1="${s.y - 5}" x2="${width - 40}" y2="${s.y - 5}" stroke="${accent}" stroke-opacity="0.18"/>`)
        .join('\n    ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="glowA" cx="0.12" cy="0.02" r="0.7">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.95" cy="0.85" r="0.75">
      <stop offset="0" stop-color="${accent2}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071022"/>
      <stop offset="1" stop-color="#040812"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#101d3a" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#0a1328" stop-opacity="0.74"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#9fb1c9" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${accent2}" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="titleFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="#9fb1c9" fill-opacity="0.10"/>
    </pattern>
    <style>
      .pt { font: 700 13px ${FONT}; letter-spacing: 1.6px; fill: #cfe0f7; }
      .ph { font: 500 12px ${FONT}; fill: #8ea3bf; }
      .sec { font: 800 13px ${FONT}; letter-spacing: 3px; fill: ${accent}; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#base)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>
  <rect width="${width}" height="${height}" fill="url(#glowA)"/>
  <rect width="${width}" height="${height}" fill="url(#glowB)"/>
  <g>
    ${motif(domain, width, height, accent, random)}
  </g>
  <rect x="0" y="198" width="${width}" height="1" fill="${accent}" fill-opacity="0.18"/>
  <text x="40" y="44" style="font: 800 13px ${FONT}; letter-spacing: 4px; fill: ${accent};">${esc(kicker.toUpperCase())}</text>
  <text x="38" y="94" style="font: 800 44px ${FONT}; letter-spacing: -0.5px; fill: url(#titleFill);">${esc(title)}</text>
  <text x="40" y="124" style="font: 500 16px ${FONT}; fill: #9fb1c9;">${esc(subtitle)}</text>
  <g>
    ${sectionSvg}
  </g>
  <g>
    ${panelSvg}
  </g>
</svg>
`;
}

export function navButton({ label, width, height, accent, accent2, active, small }) {
    const radius = small ? 10 : 13;
    const size = small ? 13 : 15;
    const fill = active
        ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="url(#on)"/>`
        : `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="#0d1830" fill-opacity="0.85" stroke="${accent}" stroke-opacity="0.38" stroke-width="1.2"/>`;
    const dot = small ? '' : `<circle cx="22" cy="${height / 2}" r="4" fill="${active ? '#06101f' : accent}"/>`;
    const textX = small ? width / 2 : 36;
    const anchor = small ? 'middle' : 'start';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="on" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}"/>
      <stop offset="1" stop-color="${accent2}"/>
    </linearGradient>
  </defs>
  ${fill}
  ${dot}
  <text x="${textX}" y="${height / 2 + size * 0.36}" text-anchor="${anchor}" style="font: ${active ? 800 : 650} ${size}px ${FONT}; letter-spacing: 0.4px; fill: ${active ? '#06101f' : '#d7e6fb'};">${esc(label)}</text>
</svg>
`;
}
