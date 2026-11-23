#!/usr/bin/env node
// Generates the Studio dashboards, navigation and artwork into package/app.
//   node dashboards/generate.mjs           write views, nav and images
//   node dashboards/generate.mjs --queries print every data source as one resolved search (for validation)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS, buildPage, pinBaseFields } from './lib/studio.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'package', 'app');
const pagesDir = join(here, 'pages');

const ORDER = [
    'kis_home',
    'kis_beds',
    'kis_ed',
    'kis_or',
    'kis_icu',
    'kis_lab',
    'kis_blood',
    'kis_pharmacy',
    'kis_medtech',
    'kis_network',
    'kis_ciscoiq',
    'kis_servers',
    'kis_integration',
    'kis_cmdb',
    'kis_security',
];

const modules = await Promise.all(
    readdirSync(pagesDir)
        .filter((file) => file.endsWith('.mjs'))
        .map((file) => import(join(pagesDir, file)).then((m) => m.default))
);
const specs = modules.filter(Boolean).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
for (const spec of specs) {
    if (!ORDER.includes(spec.id)) throw new Error(`unknown page ${spec.id}`);
    pinBaseFields(spec.dataSources);
}

if (process.argv.includes('--queries')) {
    const only = process.argv[process.argv.indexOf('--queries') + 1];
    const out = [];
    for (const spec of specs) {
        if (only && !only.startsWith('--') && spec.id !== only) continue;
        const tokens = { dept: '*', building: '*', ward: '*', ...(spec.tokens || {}) };
        const resolve = (text) => text.replace(/\$(\w+)\$/g, (m, name) => (name in tokens ? tokens[name] : m));
        for (const [id, ds] of Object.entries(spec.dataSources)) {
            let query = ds.options.query;
            let base = ds;
            while (base.type === 'ds.chain') {
                base = spec.dataSources[base.options.extend];
                query = `${base.options.query}\n${query}`;
            }
            const earliest = base.options.queryParameters?.earliest || '-60m@m';
            out.push({ page: spec.id, id, earliest, query: resolve(query).replace(/\n/g, ' ') });
        }
    }
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
    process.exit(0);
}

const viewsDir = join(appDir, 'default', 'data', 'ui', 'views');
const navDir = join(appDir, 'default', 'data', 'ui', 'nav');
const imgDir = join(appDir, 'appserver', 'static', 'images');
for (const dir of [viewsDir, imgDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
}
mkdirSync(navDir, { recursive: true });

const images = new Set();
for (const spec of specs) {
    const { xml, svgs } = buildPage(spec, specs);
    writeFileSync(join(viewsDir, `${spec.id}.xml`), xml);
    for (const [file, content] of Object.entries(svgs)) {
        writeFileSync(join(imgDir, file), content);
        images.add(file);
    }
}

const xmlText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const navItems = DOMAINS.map((domain) => {
    const pages = specs.filter((p) => p.domain === domain.id && !p.hidden);
    if (!pages.length) return '';
    if (pages.length === 1) return `  <view name="${pages[0].id}"${pages[0].id === 'kis_home' ? ' default="true"' : ''} />`;
    return `  <collection label="${xmlText(domain.label)}">\n${pages.map((p) => `    <view name="${p.id}" />`).join('\n')}\n  </collection>`;
}).filter(Boolean);
writeFileSync(
    join(navDir, 'default.xml'),
    `<nav search_view="search" color="#0b7fab">
${navItems.join('\n')}
  <collection label="Search">
    <view name="search" />
    <view name="dashboards" />
  </collection>
</nav>
`
);

console.log(`Generated ${specs.length} dashboards and ${images.size} images`);
