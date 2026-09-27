import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppState } from '../shared/types';
import { PRESETS } from '../shared/rules';
import { GameService } from '../server/service';
import { allowedOrigin, handshakeGuard } from '../server/security';

type Client = {
  socket: Socket;
  token: string;
  state: AppState;
  command: (type: string, data?: unknown, id?: string) => Promise<Record<string, unknown>>;
};
let http: HttpServer, io: Server, service: GameService, url: string, folder: string;
const clients: Client[] = [];
async function serve(file: string) {
  http = createServer();
  io = new Server(http, { allowRequest: handshakeGuard() });
  service = new GameService(io, file);
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
}
async function client(token = ''): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token }, forceNew: true, transports: ['websocket'] });
    const c = {} as Client;
    c.socket = socket;
    socket.on('session', (data) => (c.token = data.token));
    socket.on('connect_error', reject);
    socket.on('state', (state) => {
      c.state = state;
      if (c.token) resolve(c);
    });
    c.command = (type, data, id = crypto.randomUUID()) =>
      new Promise((res) => socket.emit('command', { id, type, data }, res));
    clients.push(c);
  });
}
const flush = () => new Promise((r) => setTimeout(r, 20));
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'four-winds-'));
  await serve(join(folder, 'state.json'));
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.socket.disconnect();
  service.close();
  await new Promise<void>((r) => io.close(() => r()));
  rmSync(folder, { recursive: true, force: true });
});

describe('four-player socket rooms', () => {
  it('starts with no default tables and tracks online humans through disconnect, restart, and reconnect', async () => {
    const observer = await client();
    expect(observer.state.rooms).toEqual([]);
    expect(observer.state.lobby.tables).toBe(0);
    const host = await client();
    await host.command('create', { name: 'Saved practice', rules: PRESETS.mcr, bots: true });
    const code = host.state.room!.code,
      token = host.token;
    const hand = [...host.state.room!.game!.players[0].hand];
    await flush();
    expect(observer.state.rooms[0]).toMatchObject({ code, online: 1, bots: 3 });
    host.socket.disconnect();
    await flush();
    expect(observer.state.rooms[0]).toMatchObject({ code, online: 0, bots: 3 });
    expect(service.rooms.get(code)!.players[0].hand).toEqual(hand);
    service.close();
    await new Promise<void>((r) => io.close(() => r()));
    await serve(join(folder, 'state.json'));
    const newcomer = await client();
    expect(newcomer.state.rooms[0]).toMatchObject({ code, online: 0 });
    await client(token);
    await flush();
    expect(newcomer.state.rooms[0]).toMatchObject({ code, online: 1 });
    expect(service.rooms.get(code)!.players[0].hand).toEqual(hand);
  });
  it('synchronizes readiness and allows only the host to force the configured next hand', async () => {
    const host = await client(),
      guest = await client();
    const rules = {
      ...PRESETS.mcr,
      nextHandSeconds: 0,
      advanceWhenReady: false,
      hostCanAdvance: true,
    };
    await host.command('create', { name: 'Ready checks', rules, bots: false });
    await guest.command('join', host.state.room!.code);
    await host.command('fill-bots');
    await host.command('start');
    const g = service.rooms.get(host.state.room!.code)!.game!;
    g.phase = 'ended';
    g.turnDeadline = 0;
    g.decision++;
    g.result = {
      winner: null,
      from: null,
      reason: 'Fixture draw',
      deltas: [0, 0, 0, 0],
      hands: g.players.map((p) => p.hand),
      repeat: false,
    };
    g.players.forEach((p) => (p.ready = p.bot));
    service.broadcast();
    await flush();
    const decision = g.decision;
    expect((await guest.command('force-next-hand', { decision })).ok).toBe(false);
    expect((await host.command('force-next-hand', { decision: decision - 1 })).ok).toBe(false);
    expect((await guest.command('ready', { decision })).ok).toBe(true);
    expect((await host.command('ready', { decision })).ok).toBe(true);
    await flush();
    expect(guest.state.room!.game!.players.filter((p) => p.ready)).toHaveLength(4);
    expect(g.phase).toBe('ended');
    g.rules.hostCanAdvance = false;
    expect((await host.command('force-next-hand', { decision })).ok).toBe(false);
    g.rules.hostCanAdvance = true;
    expect((await host.command('force-next-hand', { decision })).ok).toBe(true);
    expect(g.handNumber).toBe(2);
    expect((await host.command('force-next-hand', { decision })).ok).toBe(false);
    expect(g.handNumber).toBe(2);
  });

  it('shares pre-deal rules, applies them to balances and the deal, and locks them during play', async () => {
    const host = await client(),
      guest = await client();
    await host.command('create', { name: 'Editable table', rules: PRESETS.mcr, bots: false });
    await guest.command('join', host.state.room!.code);
    const rules = {
      ...structuredClone(PRESETS.singapore),
      minimum: 0,
      sgAnimals: false,
      sgFlowers: false,
      startingPoints: 500,
      startingChips: 200,
      chips: true,
      claimSeconds: 12,
    };
    expect((await guest.command('configure-rules', rules)).ok).toBe(false);
    expect((await host.command('configure-rules', { ...rules, claimSeconds: -1 })).ok).toBe(false);
    expect(host.state.room!.rules.preset).toBe('mcr');
    expect((await host.command('configure-rules', rules)).ok).toBe(true);
    await flush();
    expect(guest.state.room!.rules).toEqual(rules);
    expect(guest.state.room!.players.map((p) => [p.points, p.chips])).toEqual([
      [500, 200],
      [500, 200],
    ]);
    await host.command('fill-bots');
    await host.command('start');
    const game = service.rooms.get(host.state.room!.code)!.game!;
    expect(game.rules).toEqual(rules);
    expect(game.players.every((p) => p.hand.every((t) => t < 136) && p.bonuses.length === 0)).toBe(
      true,
    );
    expect(game.wall.every((t) => t < 136)).toBe(true);
    expect(game.players.every((p) => p.points === 500 && p.chips === 200)).toBe(true);
    expect((await host.command('configure-rules', PRESETS.riichi)).ok).toBe(false);
    expect(game.rules).toEqual(rules);
  });
  it('allows the containing lobby host to configure a member table, but rejects other members', async () => {
    const lobbyHost = await client(),
      tableHost = await client(),
      guest = await client();
    await lobbyHost.command('create-lobby', 'Club rules');
    await tableHost.command('join-lobby', lobbyHost.state.lobby.code);
    await tableHost.command('create', { name: 'Member table', rules: PRESETS.mcr, bots: false });
    await lobbyHost.command('join', tableHost.state.room!.code);
    await guest.command('join', tableHost.state.room!.code);
    const rules = { ...PRESETS.mcr, minimum: 0, claimSeconds: 5 };
    expect((await guest.command('configure-rules', rules)).ok).toBe(false);
    expect((await lobbyHost.command('configure-rules', rules)).ok).toBe(true);
    await flush();
    expect(tableHost.state.room!.rules.minimum).toBe(0);
    expect(guest.state.room!.rules.claimSeconds).toBe(5);
  });
  it('synchronizes four independent clients, protects hidden tiles, enforces host and turn ownership', async () => {
    const a = await client(),
      b = await client(),
      c = await client(),
      d = await client();
    await a.command('create', { name: 'Four humans', rules: PRESETS.mcr, bots: false });
    const code = a.state.room!.code;
    for (const p of [b, c, d]) expect((await p.command('join', code)).ok).toBe(true);
    expect((await b.command('start')).ok).toBe(false);
    expect((await a.command('start')).ok).toBe(true);
    await flush();
    for (const [i, p] of [a, b, c, d].entries()) {
      const g = p.state.room!.game!;
      expect(g.seat).toBe(i);
      expect(g.players[i].hand).toHaveLength(i === 0 ? 14 : 13);
      for (let j = 0; j < 4; j++) if (j !== i) expect(g.players[j].hand).toEqual([]);
    }
    const g = a.state.room!.game!,
      t = g.players[0].hand[0];
    expect((await b.command('action', { decision: g.decision, action: `discard:${t}` })).ok).toBe(
      false,
    );
    const id = 'same-request';
    expect(
      (await a.command('action', { decision: g.decision, action: `discard:${t}` }, id)).ok,
    ).toBe(true);
    expect(
      (await a.command('action', { decision: g.decision, action: `discard:${t}` }, id)).ok,
    ).toBe(true);
    await flush();
    for (const p of [a, b, c, d]) expect(p.state.room!.game!.players[0].discards).toHaveLength(1);
    expect(a.state.room!.game!.decision).toBe(b.state.room!.game!.decision);
  });
  it('reconnects with an opaque credential to the same seat and current hand', async () => {
    const a = await client();
    await a.command('create', { name: 'Reconnect', rules: PRESETS.riichi, bots: true });
    const hand = a.state.room!.game!.players[0].hand,
      code = a.state.room!.code,
      profile = a.state.profile.id,
      token = a.token;
    a.socket.disconnect();
    await flush();
    const again = await client(token);
    expect(again.state.profile.id).toBe(profile);
    expect(again.state.room!.code).toBe(code);
    expect(again.state.room!.game!.players[0].hand).toEqual(hand);
    expect(again.state.room!.game!.players[0].connected).toBe(true);
    const stranger = await client(profile);
    expect(stranger.state.profile.id).not.toBe(profile);
    expect(stranger.state.room).toBe(null);
  });
  it('restores persisted rooms, saved rules and identities after a server restart', async () => {
    const a = await client();
    await a.command('save-rules', {
      ...PRESETS.singapore,
      id: 'my-table',
      name: 'My table',
      chips: true,
      startingChips: 900,
    });
    await a.command('create', { name: 'Durable', rules: PRESETS.singapore, bots: true });
    const code = a.state.room!.code,
      hand = a.state.room!.game!.players[0].hand,
      token = a.token;
    a.socket.disconnect();
    await flush();
    service.close();
    await new Promise<void>((r) => io.close(() => r()));
    await serve(join(folder, 'state.json'));
    const again = await client(token);
    expect(again.state.room!.code).toBe(code);
    expect(again.state.room!.game!.players[0].hand).toEqual(hand);
    expect(again.state.rulesets[0].name).toBe('My table');
    expect(again.state.rulesets[0].startingChips).toBe(900);
  });
  it('creates a separate lobby and lets a human take over a live bot seat', async () => {
    const a = await client(),
      b = await client();
    await a.command('create-lobby', 'Sunday club');
    const lobby = a.state.lobby.code;
    await a.command('create', { name: 'Bot company', rules: PRESETS.singapore, bots: true });
    const code = a.state.room!.code;
    await flush();
    expect(b.state.rooms.some((r) => r.code === code)).toBe(false);
    expect((await b.command('join-lobby', lobby)).ok).toBe(true);
    expect(b.state.rooms.some((r) => r.code === code)).toBe(true);
    const concealed = service.rooms.get(code)!.players[1].hand.slice();
    await b.command('join', code);
    await flush();
    expect(b.state.room!.game!.seat).toBe(1);
    expect(b.state.room!.game!.players[1].hand).toEqual(concealed);
    expect(a.state.room!.game!.players[1].bot).toBe(false);
    expect(a.state.room!.game!.players[1].profile.id).toBe(b.state.profile.id);
    await b.command('leave');
    expect(service.rooms.get(code)!.players[1].bot).toBe(true);
    expect(service.rooms.get(code)!.players[1].profile.id).not.toBe(b.state.profile.id);
  });
  it('keeps copied rules immutable and rejects unbounded or malformed network input', async () => {
    const a = await client();
    expect((await a.command('save-rules', { ...PRESETS.mcr, claimSeconds: 0 })).ok).toBe(false);
    expect((await a.command('create', { name: 'Invalid', rules: {}, bots: true })).ok).toBe(false);
    await a.command('create', { name: 'Safe', rules: PRESETS.mcr, bots: false });
    await a.command('save-rules', { ...PRESETS.mcr, name: 'Faster', claimSeconds: 3 });
    expect(a.state.room!.rules.claimSeconds).toBe(8);
    expect((await a.command('profile', { name: 'x'.repeat(100), avatar: 'jade' })).ok).toBe(false);
  });
});

describe('network origin policy', () => {
  const request = (origin: string, host = 'game.example.com') =>
    ({ headers: { origin, host } }) as Parameters<typeof allowedOrigin>[0];
  it('rejects hostile browser origins and accepts only configured production origins', () => {
    expect(allowedOrigin(request('https://evil.example'))).toBe(false);
    expect(allowedOrigin(request('https://game.example.com'))).toBe(true);
    expect(allowedOrigin(request('null'))).toBe(false);
    expect(allowedOrigin(request('http://game.example.com'), 'https://game.example.com')).toBe(
      false,
    );
    expect(allowedOrigin(request('https://game.example.com'), 'https://game.example.com')).toBe(
      true,
    );
    expect(
      allowedOrigin(request('https://game.example.com.evil.test'), 'https://game.example.com'),
    ).toBe(false);
  });
  it('rejects an actual websocket upgrade from a hostile origin', async () => {
    const socket = connect(url, {
      forceNew: true,
      transports: ['websocket'],
      extraHeaders: { Origin: 'https://evil.example' },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => reject(new Error('Hostile origin accepted')));
      socket.on('connect_error', () => resolve());
    });
    socket.disconnect();
  });
});

describe('social play and saved profiles', () => {
  it('scopes chat to the current table or lobby and bounds reactions and messages', async () => {
    const a = await client(),
      b = await client(),
      outsider = await client();
    await a.command('create', { name: 'Chat', rules: PRESETS.mcr, bots: false });
    await b.command('join', a.state.room!.code);
    expect((await a.command('chat', { scope: 'table', text: '<b>Hello</b>' })).ok).toBe(true);
    await flush();
    expect(b.state.room!.chat?.[0].text).toBe('<b>Hello</b>');
    expect(outsider.state.room).toBeNull();
    expect(outsider.state.chat).toEqual([]);
    expect((await a.command('chat', { scope: 'table', text: 'spam' })).ok).toBe(false);
    expect(
      (await b.command('chat', { scope: 'table', text: 'arbitrary', reaction: true })).ok,
    ).toBe(false);
    expect((await b.command('chat', { scope: 'table', text: '👏', reaction: true })).ok).toBe(true);
    expect((await outsider.command('chat', { scope: 'table', text: 'peek' })).ok).toBe(false);
    expect((await outsider.command('chat', { scope: 'lobby', text: 'Welcome' })).ok).toBe(true);
    await flush();
    expect(a.state.chat?.at(-1)?.text).toBe('Welcome');
  });
  it('saves a last-player table, reserves their exact seat, and resumes after a restart', async () => {
    const a = await client();
    await a.command('create', { name: 'Later', rules: PRESETS.mcr, bots: true });
    const code = a.state.room!.code,
      token = a.token,
      hand = [...a.state.room!.game!.players[0].hand];
    expect((await a.command('leave', { save: true })).ok).toBe(true);
    expect(a.state.room).toBeNull();
    expect(a.state.savedTables?.[0].code).toBe(code);
    expect(service.rooms.get(code)?.reservedSeats).toHaveProperty(a.state.profile.id, 0);
    a.socket.disconnect();
    service.close();
    await new Promise<void>((r) => io.close(() => r()));
    await serve(join(folder, 'state.json'));
    const again = await client(token);
    expect((await again.command('join', code)).ok).toBe(true);
    expect(again.state.room!.game!.seat).toBe(0);
    expect(again.state.room!.game!.players[0].hand).toEqual(hand);
    expect(again.state.room!.host).toBe(again.state.profile.id);
  });
  it('stores the full completed hand under its participant and rejects another profile’s history ID', async () => {
    const a = await client(),
      stranger = await client();
    await a.command('create', {
      name: 'Archive',
      rules: { ...PRESETS.singapore, turnSeconds: 120 },
      bots: true,
    });
    const g = service.rooms.get(a.state.room!.code)!.game!;
    const { event } = await import('../server/engine');
    for (let i = 0; i < 140; i++) event(g, `Earlier event ${i}`);
    g.wall = g.wall.slice(0, g.reserve);
    const result = await a.command('action', { decision: g.decision, action: 'end-hand' });
    expect(result.ok).toBe(true);
    expect(a.state.history).toHaveLength(1);
    const id = a.state.history![0].id;
    const detail = await a.command('history-detail', id);
    expect((detail.record as { events: unknown[] }).events.length).toBeGreaterThan(140);
    expect((await stranger.command('history-detail', id)).ok).toBe(false);
  });
  it('accepts only supplied DiceBear choices and keeps lesson commands separate from live games', async () => {
    const a = await client();
    expect((await a.command('profile', { name: 'River', avatar: 'bottts:5' })).ok).toBe(true);
    expect(
      (await a.command('profile', { name: 'River', avatar: 'https://evil/avatar.svg' })).ok,
    ).toBe(false);
    await a.command('create', { name: 'Lesson isolation', rules: PRESETS.mcr, bots: true });
    const g = service.rooms.get(a.state.room!.code)!.game!,
      before = JSON.stringify(g);
    expect((await a.command('lesson-claims', 'riichi')).ok).toBe(true);
    expect(JSON.stringify(g)).toBe(before);
  });
});
