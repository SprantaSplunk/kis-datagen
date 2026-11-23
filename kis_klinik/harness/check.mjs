#!/usr/bin/env node
// Headless checks of every production bundle through the sandboxed harness host.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(`${HERE}manifest.json`, 'utf8'));
const only = process.argv.slice(2);
const shots = `${HERE}screenshots`;
mkdirSync(shots, { recursive: true });

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/harness/`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];

function check(viz, name, condition, detail = '') {
    const line = `${condition ? 'ok  ' : 'FAIL'} ${viz} – ${name}${detail ? ` (${detail})` : ''}`;
    console.log(line);
    if (!condition) failures.push(line);
}

async function settle(page, ms = 350) {
    await page.waitForTimeout(ms);
}

async function events(page) {
    return page.evaluate(() => window.harness.events());
}

async function painted(page) {
    return page.evaluate(() => {
        const frame = window.harness.frame();
        const canvas = frame.contentDocument.querySelector('canvas');
        if (!canvas || !canvas.width) return 0;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) count += 1;
        return count;
    });
}

async function frameInfo(page) {
    return page.evaluate(() => {
        const doc = window.harness.frame().contentDocument;
        const canvas = doc.querySelector('canvas');
        return {
            buttons: doc.querySelectorAll('.cs-hit').length,
            label: canvas?.getAttribute('aria-label') || '',
            cssWidth: canvas?.style.width,
            pixelWidth: canvas?.width,
            dpr: window.devicePixelRatio,
        };
    });
}

for (const viz of manifest.visualizations) {
    if (only.length && !only.includes(viz.id)) continue;
    const config = JSON.parse(readFileSync(new URL(viz.config, `file://${HERE}`), 'utf8'));
    for (const dpr of [1, 2]) {
        const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 1700, height: 1000 } });
        const page = await context.newPage();
        page.on('pageerror', (err) => failures.push(`${viz.id} host error ${err.message}`));
        await page.goto(`${base}?viz=${viz.id}`);
        await page.waitForFunction(() => window.harness && window.harness.events().some((e) => e.type === 'ready'), null, { timeout: 10000 });
        await settle(page, 900);
        const tag = `${viz.id}@${dpr}x`;

        let ev = await events(page);
        check(tag, 'loads without exceptions', !ev.some((e) => e.type === 'exception'), JSON.stringify(ev.filter((e) => e.type === 'exception')).slice(0, 300));
        check(tag, 'valid data paints', (await painted(page)) > 20);
        check(tag, 'valid data raises no error', !ev.some((e) => e.type === 'setError'));
        const info = await frameInfo(page);
        check(tag, 'HiDPI backing store', info.pixelWidth === Math.round(parseFloat(info.cssWidth) * dpr), `${info.pixelWidth} vs ${info.cssWidth}`);
        check(tag, 'canvas aria-label describes data', info.label.length > 20, info.label.slice(0, 80));
        if (dpr === 2) await page.locator('#frameBox').screenshot({ path: `${shots}/${viz.id}-dark.png` });

        if (dpr === 1) {
            await page.evaluate(() => window.harness.setFlags({ loading: true }));
            await settle(page);
            check(tag, 'loading state', (await painted(page)) > 0);
            await page.evaluate(() => window.harness.setFlags({ loading: false, empty: true }));
            await settle(page);
            ev = await events(page);
            check(tag, 'empty columns without error', !ev.some((e) => e.type === 'setError' || e.type === 'exception'));
            await page.evaluate(() => window.harness.setFlags({ empty: false, nodata: true }));
            await settle(page);
            check(tag, 'missing primary renders message', (await painted(page)) > 0);
            await page.evaluate(() => window.harness.setFlags({ nodata: false }));
            await settle(page);
            check(tag, 'recovers after no data', (await painted(page)) > 20);

            await page.evaluate(() => window.harness.clearEvents());
            const good = await page.evaluate(() => JSON.parse(document.getElementById('data').value));
            await page.evaluate(() => window.harness.setData({ fields: [{ name: 'zzz' }], columns: [['abc']] }));
            await settle(page);
            ev = await events(page);
            check(tag, 'malformed data sets an actionable error', ev.some((e) => e.type === 'setError'), JSON.stringify(ev).slice(0, 200));
            await page.evaluate((data) => window.harness.setData(data), good);
            await settle(page);
            ev = await events(page);
            check(tag, 'error cleared after recovery', ev.some((e) => e.type === 'clearError'));

            for (const [width, height] of [[320, 200], [1400, 640], [180, 120]]) {
                await page.evaluate(([w, h]) => window.harness.setSize(w, h), [width, height]);
                await settle(page, 400);
                const sized = await frameInfo(page);
                check(tag, `resize ${width}x${height}`, sized.pixelWidth === width && (await painted(page)) > 0);
            }
            await page.evaluate(() => window.harness.setSize(900, 460));

            await page.evaluate(() => window.harness.setTheme('light'));
            await settle(page, 500);
            check(tag, 'light theme paints', (await painted(page)) > 20);
            await page.locator('#frameBox').screenshot({ path: `${shots}/${viz.id}-light.png` });
            await page.evaluate(() => window.harness.setTheme('dark'));
            await page.evaluate(() => window.harness.setMode('edit'));
            await settle(page);
            check(tag, 'edit mode paints', (await painted(page)) > 20);
            await page.evaluate(() => window.harness.setMode('view'));

            await page.evaluate(() => window.harness.clearEvents());
            for (const [key, schema] of Object.entries(config.config.optionsSchema)) {
                const values = schema.enum ? [...schema.enum, 'bogus'] : schema.type === 'boolean' ? [false, true, 'nope'] : schema.type === 'number' ? [-5, 0, 1e9, 'abc', schema.default] : ['', 'x', schema.default];
                for (const value of values) {
                    await page.evaluate(([k, v]) => window.harness.setOptions({ [k]: v }), [key, value]);
                    await settle(page, 60);
                }
                await page.evaluate(([k, v]) => window.harness.setOptions({ [k]: v }), [key, schema.default]);
            }
            await settle(page);
            ev = await events(page);
            check(tag, 'every option incl. invalid values', !ev.some((e) => e.type === 'exception'), JSON.stringify(ev.filter((e) => e.type === 'exception')).slice(0, 300));

            const frame = page.frameLocator('#frameBox iframe');
            const buttons = await frameInfo(page);
            if (config.showDrilldown) {
                check(tag, 'interactive marks are buttons', buttons.buttons > 0, `${buttons.buttons}`);
                await page.evaluate(() => window.harness.clearEvents());
                await frame.locator('.cs-hit').first().click({ force: true });
                await settle(page, 150);
                ev = await events(page);
                const pointer = ev.find((e) => e.type === 'drilldown');
                check(tag, 'pointer drilldown payload is flat {name, value}', Boolean(pointer && pointer.payload.payload.name && pointer.payload.payload.value !== ''), JSON.stringify(pointer?.payload));
                await page.evaluate(() => window.harness.clearEvents());
                await frame.locator('.cs-hit').first().focus();
                await page.keyboard.press('Enter');
                await settle(page, 150);
                ev = await events(page);
                check(tag, 'keyboard drilldown', ev.some((e) => e.type === 'drilldown'));
                const labels = await page.evaluate(() => [...window.harness.frame().contentDocument.querySelectorAll('.cs-hit')].map((b) => b.getAttribute('aria-label')));
                check(tag, 'buttons have accessible names', labels.every((l) => l && l.length > 1));
            }

            for (let i = 0; i < 3; i += 1) {
                await page.evaluate(() => window.harness.reload());
                await page.waitForTimeout(400);
            }
            await page.evaluate(() => window.harness.clearEvents());
            await page.evaluate(() => window.harness.reload());
            await page.waitForFunction(() => window.harness.events().some((e) => e.type === 'ready'));
            await settle(page, 600);
            ev = await events(page);
            check(tag, 'repeated reloads stay clean', !ev.some((e) => e.type === 'exception') && (await painted(page)) > 20);

            const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1700, height: 1000 } });
            const still = await reduced.newPage();
            await still.goto(`${base}?viz=${viz.id}`);
            await still.waitForFunction(() => window.harness && window.harness.events().some((e) => e.type === 'ready'));
            await still.waitForTimeout(800);
            const a = await still.locator('#frameBox').screenshot();
            await still.waitForTimeout(700);
            const b = await still.locator('#frameBox').screenshot();
            check(tag, 'prefers-reduced-motion renders a still frame', Buffer.compare(a, b) === 0);
            await reduced.close();
        }
        await context.close();
    }
}

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll harness checks passed');
process.exit(failures.length ? 1 : 0);
