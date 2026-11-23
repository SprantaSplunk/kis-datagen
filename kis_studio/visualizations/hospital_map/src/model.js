import { cell, findField, opt, optEnum, toNumber, toText } from '../../../shared/data.js';
import { parseStatus, statusOf } from '../../../shared/theme.js';

export const DEFAULTS = {
    warn: 88,
    crit: 95,
    drillField: 'department',
    drilldownToken: 'dept',
    showFree: true,
};

const BUILDING_NAMES = {
    A: 'Haus A · Innere Medizin',
    B: 'Haus B · Chirurgie',
    C: 'Haus C · Akut & Intensiv',
    D: 'Haus D · Frauen, Kind, Psyche',
};

export function readOptions(options) {
    return {
        warn: opt(options, 'warn', DEFAULTS.warn),
        crit: opt(options, 'crit', DEFAULTS.crit),
        drillField: optEnum(options, 'drillField', ['department', 'ward', 'building'], DEFAULTS.drillField),
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        showFree: opt(options, 'showFree', DEFAULTS.showFree),
    };
}

// one row per ward: ward, building, floor, department, beds_total, occupied, free [, occupancy_pct, status]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        ward: findField(normalized, ['ward', 'station']),
        building: findField(normalized, ['building', 'haus']),
        floor: findField(normalized, ['floor', 'etage']),
        dept: findField(normalized, ['department', 'dept', 'abteilung']),
        total: findField(normalized, ['beds_total', 'beds', 'betten']),
        occupied: findField(normalized, ['occupied', 'belegt']),
        free: findField(normalized, ['free', 'frei']),
        pct: findField(normalized, ['occupancy_pct', 'occupancy', 'auslastung']),
        status: findField(normalized, ['status']),
        name: findField(normalized, ['ward_name', 'label']),
    };
    if (f.ward < 0 || (f.pct < 0 && (f.total < 0 || f.occupied < 0))) {
        return { error: 'Klinik-Lageplan braucht die Spalten "ward" und "occupancy_pct" (oder "beds_total" und "occupied").' };
    }
    const wards = [];
    for (const row of normalized.rows) {
        const ward = toText(cell(row, f.ward)).trim();
        if (!ward) continue;
        const total = toNumber(cell(row, f.total));
        const occupied = toNumber(cell(row, f.occupied));
        let pct = toNumber(cell(row, f.pct));
        if (!Number.isFinite(pct) && total > 0) pct = (100 * occupied) / total;
        let free = toNumber(cell(row, f.free));
        if (!Number.isFinite(free) && Number.isFinite(total) && Number.isFinite(occupied)) free = Math.max(0, total - occupied);
        const building = (toText(cell(row, f.building)).trim() || ward.charAt(0)).toUpperCase().slice(0, 1);
        const dept = toText(cell(row, f.dept)).trim() || ward.split('-')[0];
        const explicit = parseStatus(toText(cell(row, f.status)));
        let status = statusOf(pct, o.warn, o.crit, false);
        if (explicit === 'crit' || (Number.isFinite(free) && free <= 0)) status = 'crit';
        wards.push({
            id: ward,
            ward,
            name: toText(cell(row, f.name)).trim() || ward,
            building,
            floor: Math.max(0, Math.round(toNumber(cell(row, f.floor), 0))),
            dept,
            total,
            occupied,
            free,
            pct,
            status,
        });
    }
    if (!wards.length) return { empty: 'Keine Stationen im Ergebnis' };
    const byBuilding = new Map();
    for (const w of wards) {
        if (!byBuilding.has(w.building)) byBuilding.set(w.building, []);
        byBuilding.get(w.building).push(w);
    }
    const buildings = [...byBuilding.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, list]) => {
            const total = list.reduce((s, w) => s + (Number.isFinite(w.total) ? w.total : 0), 0);
            const free = list.reduce((s, w) => s + (Number.isFinite(w.free) ? w.free : 0), 0);
            return {
                code,
                name: BUILDING_NAMES[code] || `Haus ${code}`,
                wards: list.sort((a, b) => b.floor - a.floor || a.ward.localeCompare(b.ward)),
                total,
                free,
                critical: list.filter((w) => w.status === 'crit').length,
            };
        });
    return { model: { options: o, buildings, wards } };
}

export function describe(model) {
    const free = model.buildings.reduce((s, b) => s + b.free, 0);
    const crit = model.wards.filter((w) => w.status === 'crit').map((w) => w.ward);
    return `${model.wards.length} Stationen in ${model.buildings.length} Haeusern, ${free} freie Betten${crit.length ? `, voll oder kritisch: ${crit.join(', ')}` : ''}`;
}
