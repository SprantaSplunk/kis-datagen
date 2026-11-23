#!/usr/bin/env node
// Static file server for the local harness (project root, localhost only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

export function startServer(port = Number(process.env.PORT) || 8765) {
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
            if (!path.startsWith(ROOT) || path.includes('node_modules')) {
                response.writeHead(403).end();
                return;
            }
            const info = await stat(path);
            const file = info.isDirectory() ? join(path, 'index.html') : path;
            const body = await readFile(file);
            response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = await startServer();
    console.log(`Harness: http://127.0.0.1:${server.address().port}/harness/`);
}
