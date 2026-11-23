// Two apps from one set of pages: "studio" (kis_studio, dark) and "klinik" (kis_klinik, clinical light).
//   KIS_FLAVOR=klinik node dashboards/generate.mjs
// The klinik flavor rewrites every colour of the shared pages through CLINICAL, so page specs stay
// written against the studio palette.

const CLINICAL = {
    '#22d3ee': '#0b7fab',
    '#34e2a0': '#1e8a5a',
    '#ffc53d': '#c98a00',
    '#ff4d6d': '#c8253f',
    '#a78bfa': '#6b4fb3',
    '#60a5fa': '#2f6fc4',
    '#2dd4bf': '#0f8f84',
    '#f472b6': '#b8457c',
    '#049fd9': '#0a72a6',
    '#3b82f6': '#2c5fb3',
    '#fb923c': '#d0661f',
    '#e879f9': '#9b3fae',
    '#eaf2ff': '#13294b',
    '#9fb1c9': '#5b6878',
    '#5a1426': '#f9dde1',
    '#4d3a08': '#fcefcc',
    '#0d3b2c': '#d9f0e3',
    '#0a1328': '#ffffff',
    '#0d1833': '#f5f7fa',
    '#0b1630': '#e9eef4',
    '#050a16': '#eef1f5',
};

const FLAVORS = {
    studio: {
        id: 'studio',
        app: 'kis_studio',
        appDir: 'app',
        label: 'KIS Studio',
        theme: 'dark',
        navColor: '#22d3ee',
        svg: './svg.mjs',
        color: (c) => c,
    },
    klinik: {
        id: 'klinik',
        app: 'kis_klinik',
        appDir: 'klinik',
        label: 'KIS Klinik',
        theme: 'light',
        navColor: '#0b7fab',
        svg: './svg-klinik.mjs',
        color: (c) => CLINICAL[String(c).toLowerCase()] || c,
    },
};

const requested = process.env.KIS_FLAVOR || 'studio';
if (!FLAVORS[requested]) throw new Error(`unknown KIS_FLAVOR ${requested} (studio, klinik)`);

export const FLAVOR = FLAVORS[requested];

export function recolor(text) {
    if (FLAVOR.id === 'studio') return text;
    return text.replace(/#[0-9a-fA-F]{6}\b/g, (c) => FLAVOR.color(c));
}
