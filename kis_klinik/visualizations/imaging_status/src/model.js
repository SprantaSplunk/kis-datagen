import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';
import { parseStatus, statusOf } from '../../../shared/theme.js';

export const DEFAULTS = { drilldownToken: 'device', heliumWarn: 80, heliumCrit: 70, heatWarn: 70, heatCrit: 85 };

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        heliumWarn: opt(options, 'heliumWarn', DEFAULTS.heliumWarn),
        heliumCrit: opt(options, 'heliumCrit', DEFAULTS.heliumCrit),
        heatWarn: opt(options, 'heatWarn', DEFAULTS.heatWarn),
        heatCrit: opt(options, 'heatCrit', DEFAULTS.heatCrit),
    };
}

const BLOCKED = /gesperrt|blocked|fault|offline|stoerung/i;

// one row per device: device_id [, device_type, model, status, helium_level_pct, magnet_temp_k, shield_temp_k,
// cold_head_status, tube_heat_pct, exams_today]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        id: findField(normalized, ['device_id', 'device', 'name']),
        type: findField(normalized, ['device_type', 'type']),
        model: findField(normalized, ['model']),
        maker: findField(normalized, ['manufacturer']),
        status: findField(normalized, ['status']),
        he: findField(normalized, ['helium_level_pct', 'helium']),
        mag: findField(normalized, ['magnet_temp_k']),
        shield: findField(normalized, ['shield_temp_k']),
        cold: findField(normalized, ['cold_head_status']),
        heat: findField(normalized, ['tube_heat_pct']),
        exams: findField(normalized, ['exams_today', 'scans_today']),
        building: findField(normalized, ['building']),
    };
    if (f.id < 0 || (f.he < 0 && f.heat < 0 && f.status < 0)) {
        return { error: 'Bildgebung braucht die Spalte "device_id" und mindestens "helium_level_pct", "tube_heat_pct" oder "status".' };
    }
    const devices = [];
    for (const row of normalized.rows) {
        const id = toText(cell(row, f.id)).trim();
        if (!id) continue;
        const he = toNumber(cell(row, f.he));
        const heat = toNumber(cell(row, f.heat));
        const typeText = toText(cell(row, f.type)).trim().toUpperCase();
        const kind = typeText.startsWith('MR') || Number.isFinite(he) || id.startsWith('MR') ? 'MRT' : 'CT';
        const statusText = toText(cell(row, f.status)).trim();
        const cold = toText(cell(row, f.cold)).trim();
        let status = kind === 'MRT' ? statusOf(he, o.heliumWarn, o.heliumCrit, true) : statusOf(heat, o.heatWarn, o.heatCrit, false);
        if (status === 'none' && statusText) status = parseStatus(statusText) || 'ok';
        if (/warn/i.test(cold) && status === 'ok') status = 'warn';
        if (BLOCKED.test(statusText) || /fault/i.test(cold)) status = 'crit';
        devices.push({
            id,
            kind,
            model: toText(cell(row, f.model)).trim(),
            maker: toText(cell(row, f.maker)).trim(),
            statusText: statusText || (status === 'ok' ? 'in Betrieb' : ''),
            he,
            magnet: toNumber(cell(row, f.mag)),
            shield: toNumber(cell(row, f.shield)),
            cold,
            heat,
            exams: toNumber(cell(row, f.exams)),
            building: toText(cell(row, f.building)).trim(),
            status,
        });
    }
    if (!devices.length) return { empty: 'Keine Grossgeraete im Ergebnis' };
    devices.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id, 'de', { numeric: true }) : a.kind === 'MRT' ? -1 : 1));
    return { model: { options: o, devices } };
}

export function describe(model) {
    return model.devices
        .map((d) => `${d.id} ${d.statusText}${d.kind === 'MRT' && Number.isFinite(d.he) ? `, Helium ${d.he.toFixed(1)} Prozent` : ''}`)
        .join('; ');
}
