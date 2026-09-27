import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, cpus, platform } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { AppState, Preset } from '../../shared/types';
import { PRESETS } from '../../shared/rules';
const games = Number(process.env.LOAD_GAMES ?? 100),
  duration = Number(process.env.LOAD_SECONDS ?? 30),
  historyHands = Number(process.env.LOAD_HISTORY_HANDS ?? 0);
if (!Number.isInteger(historyHands) || historyHands < 0 || historyHands > 100)
  throw Error('Use 0–100 history hands.');
if (
  !Number.isInteger(games) ||
  games < 1 ||
  games > 100 ||
  !Number.isFinite(duration) ||
  duration < 1
)
  throw Error('Use 1–100 games and a positive duration.');
const folder = await mkdtemp(join(tmpdir(), 'four-winds-load-'));
const child = fork(new URL('./server.ts', import.meta.url), [], {
  execArgv: ['--import', 'tsx'],
  env: { ...process.env, LOAD_DATA_FILE: join(folder, 'state.json') },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
type Client = {
  socket: Socket;
  state: AppState;
  command: (type: string, data?: unknown) => Promise<any>;
};
const clients: Client[] = [],
  tables: Client[][] = [];
let measuring = false,
  stateMessages = 0,
  bytes = 0,
  failures = 0,
  commands = 0;
const latencies: number[] = [],
  health: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function message(send?: string) {
  const p = once(child, 'message', { signal: AbortSignal.timeout(30000) });
  if (send) child.send(send);
  return (await p)[0];
}
const { port } = await message();
const url = `http://127.0.0.1:${port}`;
async function client(): Promise<Client> {
  const socket = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  const c = { socket } as Client;
  socket.on('rooms-changed', (rooms: AppState['rooms']) => {
    for (const r of rooms) {
      const i = c.state.rooms.findIndex((old) => old.code === r.code);
      if (i >= 0) c.state.rooms[i] = r;
    }
    if (measuring) bytes += Buffer.byteLength(JSON.stringify(rooms));
  });
  socket.on('state', (s: AppState) => {
    c.state = s;
    if (measuring) {
      stateMessages++;
      bytes += Buffer.byteLength(JSON.stringify(s));
    }
  });
  c.command = async (type, data) => {
    const start = performance.now();
    try {
      const response = await socket
        .timeout(15000)
        .emitWithAck('command', { id: crypto.randomUUID(), type, data });
      if (measuring && type === 'action') {
        commands++;
        latencies.push(performance.now() - start);
      }
      if (!response.ok && type !== 'analyze-hand') throw Error(response.error);
      return response;
    } catch (e) {
      if (measuring) failures++;
      throw e;
    }
  };
  await new Promise<void>((resolve, reject) => {
    socket.once('state', () => resolve());
    socket.once('connect_error', reject);
  });
  clients.push(c);
  return c;
}
try {
  for (let i = 0; i < games; i++) {
    const group = await Promise.all([client(), client(), client(), client()]);
    const preset = (['mcr', 'riichi', 'singapore'] as Preset[])[i % 3];
    const result = await group[0].command('create', {
      name: `Load ${i}`,
      rules: { ...PRESETS[preset], turnSeconds: 120, claimSeconds: 3 },
      bots: false,
    });
    for (const c of group.slice(1)) await c.command('join', result.code);
    await group[0].command('start');
    tables.push(group);
  }
  if (Number(process.env.LOAD_HISTORY_HANDS ?? 0) > 0) await message('seed-history');
  await sleep(100);
  await message('reset');
  measuring = true;
  const stop = performance.now() + duration * 1000;
  const traffic = Promise.all(
    tables.map(async (group, index) => {
      await sleep(index * 20);
      while (performance.now() < stop) {
        for (const c of group) {
          const g = c.state.room?.game;
          if (!g) continue;
          const a =
            g.actions.find((a) => a.kind === 'win') ??
            g.actions.find((a) => a.kind === 'pass') ??
            g.actions.find((a) => a.kind === 'discard') ??
            g.actions[0];
          if (a) await c.command('action', { decision: g.decision, action: a.id });
        }
        await sleep(2000);
      }
    }),
  );
  const healthLoop = (async () => {
    while (performance.now() < stop) {
      const t = performance.now();
      await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => r.text());
      health.push(performance.now() - t);
      await sleep(100);
    }
  })();
  // Reproduce old clients opening the menu together, without starving the traffic generator.
  const burst =
    process.env.LOAD_ANALYSIS === '1'
      ? Promise.all(clients.map((c) => c.command('analyze-hand')))
      : Promise.resolve();
  await Promise.all([traffic, healthLoop, burst]);
  measuring = false;
  const { metrics } = await message('report');
  const percentile = (v: number[], p: number) =>
    v.sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))] ?? 0;
  const report = {
    games,
    historyHandsPerPlayer: Number(process.env.LOAD_HISTORY_HANDS ?? 0),
    players: clients.length,
    durationSeconds: duration,
    analysisBurst: process.env.LOAD_ANALYSIS === '1',
    node: process.version,
    platform: platform(),
    cpu: cpus()[0].model,
    commands,
    failures,
    actionP95Ms: percentile(latencies, 0.95),
    actionP99Ms: percentile(latencies, 0.99),
    healthP95Ms: percentile(health, 0.95),
    healthMaxMs: Math.max(...health),
    stateMessages,
    applicationMiB: bytes / 1048576,
    ...metrics,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures || report.actionP95Ms > 250 || report.eventLoopP99Ms > 100) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify(
      {
        games,
        players: clients.length,
        historyHandsPerPlayer: historyHands,
        commands,
        failures,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  const exited = once(child, 'exit');
  if (child.connected) child.send('close');
  const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
  if (child.exitCode === null && child.signalCode === null) await exited;
  clearTimeout(kill);
  for (const c of clients) c.socket.disconnect();
  await rm(folder, { recursive: true, force: true });
}
