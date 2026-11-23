import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';
import { parseStatus } from '../../../shared/theme.js';

export const DEFAULTS = { drilldownToken: 'channel', hubLabel: 'Kommunikationsserver', queueWarn: 50, queueCrit: 200, animate: true };

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        hubLabel: opt(options, 'hubLabel', DEFAULTS.hubLabel) || DEFAULTS.hubLabel,
        queueWarn: opt(options, 'queueWarn', DEFAULTS.queueWarn),
        queueCrit: opt(options, 'queueCrit', DEFAULTS.queueCrit),
        animate: opt(options, 'animate', DEFAULTS.animate),
    };
}

const STATUS_WORDS = { stau: 'warn', gestoppt: 'crit' };

// one row per channel: channel, source_system, target_system [, messages, queue_depth, avg_latency_ms, status]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        channel: findField(normalized, ['channel', 'kanal']),
        src: findField(normalized, ['source_system', 'source', 'from']),
        dst: findField(normalized, ['target_system', 'target', 'to']),
        msgs: findField(normalized, ['messages', 'messages_in', 'rate']),
        queue: findField(normalized, ['queue_depth', 'queue']),
        lat: findField(normalized, ['avg_latency_ms', 'latency_ms']),
        status: findField(normalized, ['status']),
        type: findField(normalized, ['message_type']),
    };
    if (f.src < 0 || f.dst < 0) {
        return { error: 'Schnittstellen-Fluss braucht die Spalten "source_system" und "target_system" (optional "channel", "messages", "queue_depth").' };
    }
    const channels = [];
    normalized.rows.forEach((row, i) => {
        const src = toText(cell(row, f.src)).trim();
        const dst = toText(cell(row, f.dst)).trim();
        if (!src || !dst) return;
        const queue = Math.max(0, toNumber(cell(row, f.queue), 0));
        const raw = toText(cell(row, f.status)).trim().toLowerCase();
        let status = STATUS_WORDS[raw] || parseStatus(raw) || 'ok';
        if (queue >= o.queueCrit) status = 'crit';
        else if (queue >= o.queueWarn && status === 'ok') status = 'warn';
        channels.push({
            id: toText(cell(row, f.channel)).trim() || `${src}>${dst}#${i}`,
            src,
            dst,
            msgs: Math.max(0, toNumber(cell(row, f.msgs), 0)),
            queue,
            latency: toNumber(cell(row, f.lat)),
            type: toText(cell(row, f.type)).trim(),
            status,
        });
    });
    if (!channels.length) return { empty: 'Keine Schnittstellen im Ergebnis' };
    const systems = [...new Set(channels.flatMap((c) => [c.src, c.dst]))];
    systems.sort((a, b) => (a === 'KIS' ? -1 : b === 'KIS' ? 1 : a.localeCompare(b)));
    const systemStatus = {};
    for (const s of systems) {
        const list = channels.filter((c) => c.src === s || c.dst === s);
        systemStatus[s] = list.some((c) => c.status === 'crit') ? 'crit' : list.some((c) => c.status === 'warn') ? 'warn' : 'ok';
    }
    return { model: { options: o, channels, systems, systemStatus } };
}

export function describe(model) {
    const bad = model.channels.filter((c) => c.status !== 'ok').map((c) => `${c.id} (Warteschlange ${c.queue})`);
    return `${model.channels.length} Schnittstellen zwischen ${model.systems.length} Systemen. ${bad.length ? `Gestoert: ${bad.join(', ')}` : 'Alle Kanaele laufen.'}`;
}
