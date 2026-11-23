import { cell, findField, opt, toNumber, toText } from '../../../shared/data.js';
import { parseStatus } from '../../../shared/theme.js';

export const DEFAULTS = { drilldownToken: 'ci', maxPerLayer: 24, propagate: true };

const LAYERS = [
    { key: 'service', label: 'Business Service', match: /service/i },
    { key: 'db', label: 'Datenbank', match: /^db|database/i },
    { key: 'server', label: 'Server / Medizintechnik', match: /server|medical|device/i },
    { key: 'network', label: 'Netzwerk', match: /net|switch|router|wap/i },
];

export function readOptions(options) {
    return {
        drilldownToken: opt(options, 'drilldownToken', DEFAULTS.drilldownToken) || DEFAULTS.drilldownToken,
        maxPerLayer: Math.round(Math.min(80, Math.max(3, opt(options, 'maxPerLayer', DEFAULTS.maxPerLayer)))),
        propagate: opt(options, 'propagate', DEFAULTS.propagate),
    };
}

function layerOf(type) {
    const kind = String(type || '').replace(/^cmdb_ci_/i, '');
    const i = LAYERS.findIndex((l) => l.match.test(kind));
    return i < 0 ? 2 : i;
}

const SEVERITY = { none: 0, ok: 1, warn: 2, crit: 3 };

function statusFrom(text) {
    const t = toText(text).trim();
    if (!t) return null;
    if (/non-operational|unreachable|offline|gesperrt|kritisch|p1/i.test(t)) return 'crit';
    if (/degraded|warn|stau|p2/i.test(t)) return 'warn';
    return parseStatus(t) || (/operational|ok|reachable/i.test(t) ? 'ok' : null);
}

// one row per relation: parent, child [, parent_type, child_type, parent_status, child_status]
export function toModel(normalized, options) {
    const o = readOptions(options);
    const f = {
        parent: findField(normalized, ['parent', 'from', 'source']),
        child: findField(normalized, ['child', 'to', 'target']),
        ptype: findField(normalized, ['parent_class', 'parent_type']),
        ctype: findField(normalized, ['child_class', 'child_type']),
        pstat: findField(normalized, ['parent_status']),
        cstat: findField(normalized, ['child_status', 'status']),
        weight: findField(normalized, ['incidents', 'weight']),
    };
    if (f.parent < 0 || f.child < 0) {
        return { error: 'Service-Abhaengigkeiten braucht die Spalten "parent" und "child" (optional "parent_class", "child_class", "child_status").' };
    }
    const nodes = new Map();
    const edges = [];
    const touch = (name, type, status) => {
        if (!nodes.has(name)) nodes.set(name, { id: name, type: type || '', layer: layerOf(type), own: 'ok', status: 'ok', incidents: 0 });
        const node = nodes.get(name);
        if (type && !node.type) {
            node.type = type;
            node.layer = layerOf(type);
        }
        if (status && SEVERITY[status] > SEVERITY[node.own]) node.own = status;
        return node;
    };
    for (const row of normalized.rows) {
        const p = toText(cell(row, f.parent)).trim();
        const c = toText(cell(row, f.child)).trim();
        if (!p || !c || p === c) continue;
        const pn = touch(p, toText(cell(row, f.ptype)).trim(), statusFrom(cell(row, f.pstat)));
        const cn = touch(c, toText(cell(row, f.ctype)).trim(), statusFrom(cell(row, f.cstat)));
        const w = toNumber(cell(row, f.weight), 0);
        if (w > 0) cn.incidents += w;
        if (!edges.some((e) => e.from === pn.id && e.to === cn.id)) edges.push({ from: pn.id, to: cn.id });
    }
    if (!nodes.size) return { empty: 'Keine Beziehungen im Ergebnis' };
    for (const n of nodes.values()) n.status = n.own;
    // impact propagation: a failed dependency degrades everything that depends on it (upwards)
    if (o.propagate) {
        let changed = true;
        let guard = 0;
        while (changed && guard < 20) {
            changed = false;
            guard += 1;
            for (const e of edges) {
                const parent = nodes.get(e.from);
                const child = nodes.get(e.to);
                // every relation points from the consumer (parent) to the provider (child)
                const impacted = SEVERITY[child.status] >= SEVERITY.warn ? 'warn' : null;
                if (impacted && SEVERITY[parent.status] < SEVERITY[impacted]) {
                    parent.status = impacted;
                    parent.impacted = true;
                    changed = true;
                }
            }
        }
    }
    const layers = LAYERS.map((l, i) => {
        let list = [...nodes.values()].filter((n) => n.layer === i);
        list.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || a.id.localeCompare(b.id, 'de', { numeric: true }));
        const hidden = Math.max(0, list.length - o.maxPerLayer);
        list = list.slice(0, o.maxPerLayer);
        return { key: l.key, label: l.label, nodes: list, hidden };
    }).filter((l) => l.nodes.length);
    const visible = new Set(layers.flatMap((l) => l.nodes.map((n) => n.id)));
    return {
        model: {
            options: o,
            layers,
            edges: edges.filter((e) => visible.has(e.from) && visible.has(e.to)),
            nodes: [...nodes.values()].filter((n) => visible.has(n.id)),
        },
    };
}

export function describe(model) {
    const crit = model.nodes.filter((n) => n.own === 'crit').map((n) => n.id);
    const impacted = model.nodes.filter((n) => n.impacted).map((n) => n.id);
    return `${model.nodes.length} CIs, ${model.edges.length} Beziehungen. ${crit.length ? `Ausgefallen: ${crit.join(', ')}. ` : ''}${impacted.length ? `Betroffen: ${impacted.join(', ')}.` : 'Keine Auswirkungen.'}`;
}
