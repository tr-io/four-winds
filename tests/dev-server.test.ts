import { expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import config from '../vite.config';

it('serves browser modules after install cleanup removes node_modules/.vite', async () => {
  // Isolate the app and its cache so this never touches a developer's running server.
  const project = resolve(import.meta.dirname, '..');
  const root = mkdtempSync(join(tmpdir(), 'four-winds-dev-'));
  let server: ViteDevServer | undefined;
  try {
    for (const name of ['client', 'shared', 'index.html', 'package.json', 'package-lock.json']) {
      cpSync(join(project, name), join(root, name), { recursive: true });
    }
    mkdirSync(join(root, 'node_modules'));
    for (const name of readdirSync(join(project, 'node_modules'))) {
      if (!name.startsWith('.')) {
        symlinkSync(
          join(project, 'node_modules', name),
          join(root, 'node_modules', name),
          'junction',
        );
      }
    }
    server = await createServer({
      ...config,
      root,
      configFile: false,
      logLevel: 'error',
      server: { ...config.server, host: '127.0.0.1', port: 0, open: false },
    });
    await server.listen();
    const origin = server.resolvedUrls!.local[0];
    await fetch(new URL('client/main.ts', origin));
    await server.waitForRequestsIdle();
    const optimizer = server.environments.client.depsOptimizer!;
    await optimizer.scanProcessing;
    await Promise.all(Object.values(optimizer.metadata.discovered).map((dep) => dep.processing));
    const modules = new Set<string>();
    for (const entry of ['client/main.ts', 'client/table.ts', 'shared/rules.ts']) {
      const source = await (await fetch(new URL(entry, origin))).text();
      for (const match of source.matchAll(/["']([^"']+\/deps\/[^"']+\.js\?v=[^"']+)["']/g)) {
        modules.add(match[1]);
      }
    }
    expect(modules.size).toBeGreaterThanOrEqual(3);
    // npm ci deletes this directory even when reinstalling an unchanged lockfile.
    rmSync(join(root, 'node_modules', '.vite'), { recursive: true, force: true });
    // Force a disk read; Vite's in-memory transforms can temporarily hide missing files.
    server.environments.client.moduleGraph.invalidateAll();
    for (const path of modules) {
      const response = await fetch(new URL(path, origin));
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toMatch(/javascript/);
    }
  } finally {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
