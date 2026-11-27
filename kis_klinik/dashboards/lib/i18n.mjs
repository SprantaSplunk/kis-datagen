// Build-time translation for the English app (KIS_LANG=en). The data dictionary is the one TA-kis-datagen
// applies to the events, so literals in searches match the English data exactly.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const LANG = process.env.KIS_LANG === 'en' ? 'en' : 'de';
const DATA = join(here, '..', '..', '..', 'TA-kis-datagen', 'bin', 'kis_sim', 'lang_en.json');
const UI = join(here, '..', '..', 'i18n', 'dashboards_en.json');
const EDGE = 'A-Za-z0-9_\\-';

function compile() {
    const data = JSON.parse(readFileSync(DATA, 'utf8'));
    const ui = JSON.parse(readFileSync(UI, 'utf8'));
    const phrases = { ...data.phrases };
    for (const [de, en] of Object.entries(ui.phrases)) {
        if (de in data.phrases && data.phrases[de] !== en) {
            throw new Error(`dashboards_en.json: "${de}" must stay "${data.phrases[de]}" (TA data dictionary), not "${en}"`);
        }
        phrases[de] = en;
    }
    const keys = Object.keys(phrases).sort((a, b) => b.length - a.length);
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        phrases,
        patterns: [...data.patterns, ...ui.patterns].map(([rx, repl]) => [new RegExp(rx, 'g'), repl]),
        textPatterns: ui.textPatterns.map(([rx, repl]) => [new RegExp(rx, 'g'), repl]),
        rx: new RegExp(`(?<![${EDGE}])(?:${keys.map(escape).join('|')})(?![${EDGE}])`, 'g'),
    };
}

const T = LANG === 'en' ? compile() : null;

function apply(text, quote) {
    let out = text;
    for (const [rx, repl] of T.patterns) out = out.replace(rx, repl);
    return out.replace(T.rx, (m) => (quote && !/^\w+$/.test(T.phrases[m]) ? JSON.stringify(T.phrases[m]) : T.phrases[m]));
}

// labels, titles, hints, markdown; number formats only after the phrases so "1,5 Tagen" still matches
export function tr(text) {
    if (!T || typeof text !== 'string') return text;
    let out = apply(text, false);
    for (const [rx, repl] of T.textPatterns) out = out.replace(rx, repl);
    return out;
}

// SPL: quoted strings are translated as they are; a bare word that becomes several words gets quotes
export function trSpl(query) {
    if (!T) return query;
    return query
        .split(/("(?:[^"\\]|\\.)*"|'[^'\n]*')/)
        .map((part, i) => (i % 2 ? part[0] + apply(part.slice(1, -1), false) + part[0] : apply(part, true)))
        .join('');
}

// every string value and key of a dashboard definition; `query` holds SPL
export function localize(value, key) {
    if (!T) return value;
    if (typeof value === 'string') return key === 'query' ? trSpl(value) : tr(value);
    if (Array.isArray(value)) return value.map((v) => localize(v));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [tr(k), localize(v, k)]));
    }
    return value;
}
