#!/usr/bin/env node
// Every production bundle must parse as a self-contained ES module without unresolved imports.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
let failed = 0;
for (const name of readdirSync(dist)) {
    const file = new URL(`${name}/visualization.js`, dist);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    try {
        const module = new vm.SourceTextModule(source, { identifier: `${name}/visualization.js` });
        if (module.dependencySpecifiers.length) throw new Error(`unresolved imports: ${module.dependencySpecifiers.join(', ')}`);
        console.log(`ok   ${name}: ES module, ${(source.length / 1024).toFixed(1)} KB, no imports`);
    } catch (err) {
        failed += 1;
        console.log(`FAIL ${name}: ${err.message}`);
    }
}
process.exit(failed ? 1 : 0);
