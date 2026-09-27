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
