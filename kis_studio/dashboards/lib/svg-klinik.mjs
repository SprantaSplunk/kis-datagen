// Clinical light artwork for kis_klinik: white header, flat tabs, white cards with a soft shadow.
// Same signatures and geometry as svg.mjs, so both apps share one page layout.
import { esc } from './svg.mjs';

export const FONT = "'Segoe UI', 'Source Sans Pro', 'Helvetica Neue', Arial, sans-serif";

const INK = '#13294b';
const SLATE = '#5b6878';
const LINE = '#d6dde6';
const PAGE = '#eef1f5';
const BRAND = '#0b7fab';

// thin line pictogram per domain, drawn at the right end of the header
function pictogram(domain, right) {
    const s = `fill="none" stroke="#c3cedb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    const x = right - 150;
    switch (domain.motif) {
        case 'ecg':
            return `<path ${s} d="M${x - 220} 92 h120 l14 -34 l18 72 l16 -58 l10 20 h150"/>
    <path ${s} d="M${x + 96} 56 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z"/>`;
        case 'hex':
            return `<path ${s} d="M${x + 40} 40 v34 l-34 56 a8 8 0 0 0 7 12 h78 a8 8 0 0 0 7 -12 l-34 -56 v-34 m-30 0 h56"/>
    <path ${s} d="M${x + 22} 112 h76"/>
    <circle ${s} cx="${x - 70}" cy="90" r="34"/><path ${s} d="M${x - 70} 70 v40 M${x - 90} 90 h40"/>`;
        case 'orbit':
            return `<rect ${s} x="${x - 40}" y="44" width="160" height="104" rx="10"/>
    <path ${s} d="M${x - 24} 104 h34 l10 -26 l14 46 l12 -30 h50"/><path ${s} d="M${x + 20} 148 v18 m-30 0 h60"/>`;
        case 'mesh': {
            const pts = [[x - 120, 70], [x - 40, 120], [x + 40, 60], [x + 110, 118], [x - 10, 160]];
            const lines = [[0, 1], [1, 2], [2, 3], [1, 4], [3, 4], [0, 4]]
                .map(([a, b]) => `<line ${s} x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`)
                .join('\n    ');
            return `${lines}\n    ${pts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="9" fill="#ffffff" stroke="#c3cedb" stroke-width="2"/>`).join('\n    ')}`;
        }
        case 'circuit':
            return [0, 1, 2]
                .map((i) => `<rect ${s} x="${x - 60}" y="${44 + i * 40}" width="190" height="30" rx="5"/><circle cx="${x - 40}" cy="${59 + i * 40}" r="4" fill="#c3cedb"/><path ${s} d="M${x + 60} ${59 + i * 40} h50"/>`)
                .join('\n    ');
        case 'code':
            return `<path ${s} d="M${x + 30} 40 l64 22 v40 c0 34 -28 54 -64 66 c-36 -12 -64 -32 -64 -66 v-40 z"/>
    <path ${s} d="M${x + 6} 104 l18 18 l32 -38"/>`;
        default:
            return '';
    }
}

export function background({ width, height, domain, title, subtitle, kicker, panels, sections = [] }) {
    const accent = domain.accent;
    const panelSvg = panels
        .map((p) => {
            const tone = p.accent || accent;
            const head = p.title
                ? `<rect x="${p.x + 18}" y="${p.y + 18}" width="8" height="8" rx="2" fill="${tone}"/>
    <text x="${p.x + 34}" y="${p.y + 28}" class="pt">${esc(p.title)}</text>${p.hint ? `\n    <text x="${p.x + p.w - 18}" y="${p.y + 28}" class="ph" text-anchor="end">${esc(p.hint)}</text>` : ''}
    <line x1="${p.x + 1}" y1="${p.y + 40.5}" x2="${p.x + p.w - 1}" y2="${p.y + 40.5}" stroke="#edf1f5"/>`
                : '';
            return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="#ffffff" stroke="${LINE}" filter="url(#card)"/>
    ${head}`;
        })
        .join('\n    ');
    const sectionSvg = sections
        .map((s) => `<text x="${s.x}" y="${s.y}" class="sec">${esc(s.label)}</text>
    <rect x="${s.x}" y="${s.y + 6}" width="28" height="3" rx="1.5" fill="${accent}"/>`)
        .join('\n    ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="card" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#13294b" flood-opacity="0.07"/>
    </filter>
    <style>
      .pt { font: 600 15px ${FONT}; fill: ${INK}; }
      .ph { font: 400 12.5px ${FONT}; fill: #6b7785; }
      .sec { font: 700 15px ${FONT}; fill: ${INK}; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="${PAGE}"/>
  <rect width="${width}" height="200" fill="#ffffff"/>
  <rect width="${width}" height="4" fill="${BRAND}"/>
  <rect x="0" y="199" width="${width}" height="1" fill="${LINE}"/>
  <g>
    ${pictogram(domain, width - 40)}
  </g>
  <circle cx="54" cy="40" r="14" fill="${BRAND}"/>
  <path d="M51 31 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 z" fill="#ffffff"/>
  <text x="78" y="45" style="font: 600 13px ${FONT}; letter-spacing: 0.3px; fill: ${SLATE};">${esc(kicker)}</text>
  <rect x="${width - 330}" y="26" width="290" height="28" rx="14" fill="#f2f5f8" stroke="${LINE}"/>
  <text x="${width - 185}" y="45" text-anchor="middle" style="font: 600 12px ${FONT}; fill: ${SLATE};">Synthetische Demo-Daten · keine Patientendaten</text>
  <text x="40" y="96" style="font: 600 36px ${FONT}; fill: ${INK};">${esc(title)}</text>
  <text x="40" y="124" style="font: 400 16px ${FONT}; fill: ${SLATE};">${esc(subtitle)}</text>
  <g>
    ${sectionSvg}
  </g>
  <g>
    ${panelSvg}
  </g>
</svg>
`;
}

export function navButton({ label, width, height, accent, active, small }) {
    const size = small ? 13.5 : 15;
    let shape;
    let ink;
    if (small) {
        shape = active
            ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${(height - 2) / 2}" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="1.5"/>`
            : `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${(height - 2) / 2}" fill="#ffffff" stroke="${LINE}"/>`;
        ink = active ? accent : '#34465c';
    } else {
        shape = active
            ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="6" fill="${accent}"/>`
            : `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="6" fill="#f7f9fb" stroke="${LINE}"/>
  <rect x="16" y="${height / 2 - 4}" width="8" height="8" rx="2" fill="${accent}"/>`;
        ink = active ? '#ffffff' : '#34465c';
    }
    const textX = small || active ? width / 2 : 34;
    const anchor = small || active ? 'middle' : 'start';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${shape}
  <text x="${textX}" y="${height / 2 + size * 0.36}" text-anchor="${anchor}" style="font: ${active ? 700 : 600} ${size}px ${FONT}; fill: ${ink};">${esc(label)}</text>
</svg>
`;
}
