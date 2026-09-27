// Usage: node --import tsx scripts/measure-startup.ts <build directory> [runs]
// Serves an isolated game with gzip, then measures fresh mobile browser contexts.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { chromium, devices } from '@playwright/test';
import { io as connect } from 'socket.io-client';
import { createTestServer } from '../tests/fixtures/http-server';
import { GameService } from '../server/service';

const root = resolve(process.argv[2] ?? 'dist');
const runs = Number(process.argv[3] ?? 5);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('Use 1–20 runs.');
const assets = new Map<string, { data: Buffer; type: string; compressed: boolean }>();
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
function collect(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else {
      const content = readFileSync(path);
      const compressed = /\.(html|js|css|svg)$/.test(path);
      assets.set(`/${relative(root, path).split('\\').join('/')}`, {
        data: compressed ? gzipSync(content) : content,
        compressed,
        type: types[extname(path)] ?? 'application/octet-stream',
      });
    }
  }
}
collect(root);
const app = express();
app.use((req, res) => {
  const asset = assets.get(req.path === '/' ? '/index.html' : req.path);
  if (!asset) {
    res.sendStatus(404);
    return;
  }
  res.setHeader('Content-Type', asset.type);
  if (asset.compressed) res.setHeader('Content-Encoding', 'gzip');
  res.end(asset.data);
});
const server = createTestServer(app);
const service = new GameService(server.io, null);
const browser = await chromium.launch();
try {
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.http.address() as { port: number }).port}`;
  const token = await new Promise<string>((resolveToken, reject) => {
    const socket = connect(url);
    socket.on('connect_error', reject);
    socket.on('session', ({ token }: { token: string }) => {
      socket.emit(
        'command',
        {
          id: 'benchmark-profile',
          type: 'profile',
          data: { name: 'Startup check', avatar: 'adventurer:0' },
        },
        () => {
          socket.disconnect();
          resolveToken(token);
        },
      );
    });
  });
  const results: {
    readyMs: number;
    firstPaintMs: number;
    javascriptBytes: number;
    scriptMs: number;
  }[] = [];
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
    try {
      await context.addInitScript(
        (token) => localStorage.setItem('four-winds-token', token),
        token,
      );
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
        connectionType: 'cellular4g',
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Performance.enable');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () =>
          document.querySelector('#connection-text')?.textContent === 'Connected' &&
          document.querySelector('#hero-table canvas') &&
          [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      );
      const timing = await page.evaluate(() => ({
        readyMs: Math.round(performance.now()),
        firstPaintMs: Math.round(
          performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
        ),
        javascriptBytes: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter((r) => new URL(r.name).pathname.endsWith('.js'))
          .reduce((n, r) => n + r.encodedBodySize, 0),
      }));
      const { metrics } = await cdp.send('Performance.getMetrics');
      results.push({
        ...timing,
        scriptMs: Math.round((metrics.find((m) => m.name === 'ScriptDuration')?.value ?? 0) * 1000),
      });
    } finally {
      await context.close();
    }
  }
  const median = (key: keyof (typeof results)[number]) => {
    const values = results.map((r) => r[key]).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  console.log(
    JSON.stringify(
      {
        build: relative(process.cwd(), root),
        conditions:
          'Pixel 7 viewport; Chromium; cold cache; 4x CPU slowdown; 1.6 Mbps down; 150ms latency; gzip; reduced motion',
        results,
        median: {
          readyMs: median('readyMs'),
          firstPaintMs: median('firstPaintMs'),
          javascriptBytes: median('javascriptBytes'),
          scriptMs: median('scriptMs'),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  service.close();
  await server.close();
}
