// Synthetic single-lead ECG (lead II) built from Gaussian waves per beat. Each bed gets its own
// rhythm and morphology; beat onsets come from a per-bed grid so premature beats are followed by a
// compensatory pause and atrial fibrillation stays irregular without beats overlapping.

export const RHYTHMS = {
    SR: 'Sinusrhythmus',
    VHF: 'Vorhofflimmern',
    VES: 'Sinusrhythmus mit VES',
    LSB: 'Linksschenkelblock',
    SM: 'Schrittmacher-Rhythmus',
    AVB1: 'AV-Block I',
};

const TAU = Math.PI * 2;

export function hash01(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
}

function mix01(a, b) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
}

export function rhythmFor(id, given) {
    const code = String(given || '').toUpperCase();
    if (code in RHYTHMS) return code;
    const u = hash01(`${id}:rhythm`);
    return u < 0.45 ? 'SR' : u < 0.65 ? 'VHF' : u < 0.77 ? 'VES' : u < 0.85 ? 'LSB' : u < 0.92 ? 'SM' : 'AVB1';
}

export function ecgProfile(id, rhythm, hr, respRate) {
    const h = (k) => hash01(`${id}:${k}`);
    const wide = rhythm === 'LSB' || rhythm === 'SM';
    const tNeg = h('tneg') < 0.12;
    const stRoll = h('st');
    return {
        rhythm,
        seed: h('seed'),
        key: Math.floor(h('key') * 2 ** 31),
        freq: Math.min(220, Math.max(30, hr)) / 60,
        resp: Math.min(40, Math.max(6, Number.isFinite(respRate) ? respRate : 14)) / 60,
        p: rhythm === 'VHF' || rhythm === 'SM' ? 0 : 0.07 + 0.09 * h('p'),
        pr: rhythm === 'AVB1' ? 0.27 + 0.06 * h('pr') : 0.13 + 0.06 * h('pr'),
        qrs: wide ? 0.15 + 0.03 * h('qrs') : 0.075 + 0.025 * h('qrs'),
        q: wide ? 0 : 0.16 * h('q'),
        r: 0.7 + 0.45 * h('r'),
        s: wide ? 0.05 : 0.1 + 0.4 * h('s'),
        rPrime: rhythm === 'LSB' ? 0.45 + 0.25 * h('rp') : 0,
        st: wide ? -0.07 : stRoll < 0.12 ? 0.1 + 0.06 * h('stv') : stRoll > 0.9 ? -0.08 - 0.04 * h('stv') : 0,
        t: wide ? -(0.15 + 0.15 * h('t')) : tNeg ? -(0.08 + 0.1 * h('t')) : 0.14 + 0.22 * h('t'),
        qtc: 0.38 + 0.06 * h('qt'),
        irregular: rhythm === 'VHF' ? 0.3 : 0.012,
        pvc: rhythm === 'VES' ? 0.14 + 0.08 * h('pvc') : 0,
        pvcSign: h('pvcs') < 0.5 ? 1 : -1,
        pacer: rhythm === 'SM',
        fib: rhythm === 'VHF' ? 0.025 + 0.025 * h('fib') : 0,
        wander: 0.025 + 0.05 * h('w'),
        noise: 0.006 + 0.01 * h('n'),
    };
}

function isPvc(pf, k) {
    if (!pf.pvc) return false;
    return mix01(pf.key, k * 2 + 1) < pf.pvc && !(mix01(pf.key, k * 2 - 1) < pf.pvc);
}

function beatStart(pf, k) {
    const rr = 1 / pf.freq;
    let t = (k + pf.seed) * rr + 0.03 * rr * Math.sin(k * 0.37 + pf.seed * TAU) + 0.02 * rr * Math.sin(k * 0.11 + pf.seed * 3.1);
    t += (mix01(pf.key, k * 2) - 0.5) * 2 * pf.irregular * rr;
    if (isPvc(pf, k)) t -= 0.32 * rr;
    return t;
}

const gauss = (s, c, w, a) => {
    const d = (s - c) / w;
    return a * Math.exp(-0.5 * d * d);
};
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function layout(pf, rr, pvc) {
    const qt = Math.min(0.5, Math.max(0.26, pf.qtc * Math.sqrt(rr)));
    if (pvc) {
        const w = 0.16;
        const qc = 0.12;
        return { pvc, w, qc, tc: qc + 0.26, qt };
    }
    const need = 0.06 + pf.pr + pf.qrs + qt + 0.06;
    const k = Math.min(1, rr / need);
    const w = pf.qrs;
    const qc = (0.06 + pf.pr) * k;
    return { pvc, w, qc, pc: 0.06 * k, tc: qc - w / 2 + 0.72 * qt * k, tw: 0.05 * Math.max(0.6, k), k };
}

function complex(pf, s, rr, pvc) {
    if (s < -0.1 || s > rr + 0.6) return 0;
    const L = layout(pf, rr, pvc);
    if (pvc) {
        const a = 1.5 * pf.pvcSign;
        return gauss(s, L.qc - 0.03, 0.035, a) + gauss(s, L.qc + 0.05, 0.035, -0.45 * a) + gauss(s, L.tc, 0.07, -0.5 * a);
    }
    const w = L.w;
    const wide = w >= 0.12;
    let v = gauss(s, L.pc, 0.022, pf.p);
    if (wide) {
        // broad, notched (LBBB) or slurred (paced) complex
        v += gauss(s, L.qc - 0.12 * w, 0.17 * w, pf.r * 0.85);
        if (pf.rPrime) v += gauss(s, L.qc + 0.22 * w, 0.15 * w, pf.r * 0.8);
        else v += gauss(s, L.qc + 0.25 * w, 0.2 * w, -0.25);
    } else {
        v += gauss(s, L.qc - 0.3 * w, 0.11 * w, -pf.q);
        v += gauss(s, L.qc, 0.13 * w, pf.r);
        v += gauss(s, L.qc + 0.3 * w, 0.12 * w, -pf.s);
    }
    if (pf.st) v += pf.st * (sigmoid((s - (L.qc + 0.55 * w)) / 0.008) - sigmoid((s - L.tc) / 0.03));
    v += gauss(s, L.tc, wide ? L.tw * 1.4 : L.tw, pf.t);
    if (pf.pacer) v += gauss(s, L.qc - 0.75 * w, 0.0025, 1.6);
    return v;
}

function baseline(pf, t) {
    let v = pf.wander * Math.sin(TAU * pf.resp * t + pf.seed * TAU);
    if (pf.fib) v += pf.fib * (Math.sin(TAU * 5.7 * t + pf.seed * 9) + 0.6 * Math.sin(TAU * 7.9 * t + pf.seed * 3));
    v += pf.noise * Math.sin(t * 311 + pf.seed * 50) * Math.sin(t * 53.3);
    return v;
}

function beatAround(pf, t) {
    let k = Math.floor(t * pf.freq - pf.seed) + 2;
    while (beatStart(pf, k) > t) k -= 1;
    return k;
}

export function ecgValue(pf, t) {
    const k = beatAround(pf, t);
    const s0 = beatStart(pf, k);
    const s1 = beatStart(pf, k + 1);
    const sp = beatStart(pf, k - 1);
    return complex(pf, t - s0, s1 - s0, isPvc(pf, k)) + complex(pf, t - sp, s0 - sp, isPvc(pf, k - 1)) + baseline(pf, t);
}

// exact times of narrow features inside [t0, t1] so R peaks and pacer spikes never fall between samples
export function keyTimes(pf, t0, t1) {
    const out = [];
    for (let k = beatAround(pf, t0) - 1; ; k += 1) {
        const start = beatStart(pf, k);
        if (start > t1) break;
        const rr = beatStart(pf, k + 1) - start;
        const L = layout(pf, rr, isPvc(pf, k));
        const offsets = L.pvc
            ? [L.qc - 0.03, L.qc + 0.045]
            : L.w >= 0.12
              ? [L.qc - 0.12 * L.w, L.qc + 0.22 * L.w, ...(pf.pacer ? [L.qc - 0.75 * L.w - 0.004, L.qc - 0.75 * L.w, L.qc - 0.75 * L.w + 0.004] : [])]
              : [L.qc - 0.3 * L.w, L.qc, L.qc + 0.3 * L.w];
        for (const off of offsets) {
            const tv = start + off;
            if (tv >= t0 && tv <= t1) out.push(tv);
        }
    }
    return out;
}
