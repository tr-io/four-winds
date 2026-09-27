import { randomBytes, randomInt, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { AppState, Profile, Room, Rules, Lobby, LobbyView } from '../shared/types';
import { PRESETS, rulesSchema } from '../shared/rules';
import { analyzeHand } from './hand-analysis';
import {
  applyAction,
  botAction,
  event,
  gameView,
  newPlayer,
  nextHand,
  publicPlayer,
  startGame,
  tickGame,
} from './engine';

type Session = {
  tokenHash: string;
  profile: Profile;
  rulesets: Rules[];
  room: string | null;
  lobby: string;
};
type Store = { version: 1; sessions: Session[]; rooms: Room[]; lobbies: Lobby[] };
const avatars = ['jade', 'clay', 'gold', 'blue'];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const textInput = z.string().trim().min(1).max(24);
export class GameService {
  sessions = new Map<string, Session>();
  rooms = new Map<string, Room>();
  lobbies = new Map<string, Lobby>([
    ['FOURWN', { code: 'FOURWN', name: 'The Four Winds Club', host: '', createdAt: 0 }],
  ]);
  private sockets = new Map<string, Set<Socket>>();
  private seen = new Map<string, Map<string, unknown>>();
  private botDue = new Map<string, { decision: number; at: number }>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    public io: Server,
    private file: string | null,
  ) {
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Store;
      if (data.version !== 1) throw new Error('Unsupported saved state version.');
      for (const s of data.sessions) {
        s.lobby ??= 'FOURWN';
        s.rulesets = s.rulesets.map((r) => rulesSchema.parse(r));
        this.sessions.set(s.tokenHash, s);
      }
      for (const l of data.lobbies ?? []) this.lobbies.set(l.code, l);
      for (const r of data.rooms) {
        r.lobby ??= 'FOURWN';
        r.rules = rulesSchema.parse(r.rules);
        for (const p of r.players) if (!p.bot) p.connected = false;
        if (r.game) {
          r.game.rules = rulesSchema.parse(r.game.rules);
          r.game.players = r.players;
          for (const p of r.players) if (!p.bot) p.connected = false;
        }
        this.rooms.set(r.code, r);
      }
    }
    io.on('connection', (socket) => this.connect(socket));
    this.timer = setInterval(() => this.tick(), 200);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
    this.persist();
  }
  persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(
      this.file + '.tmp',
      JSON.stringify({
        version: 1,
        sessions: [...this.sessions.values()],
        rooms: [...this.rooms.values()],
        lobbies: [...this.lobbies.values()],
      } satisfies Store),
      { mode: 0o600 },
    );
    renameSync(this.file + '.tmp', this.file);
  }
  private connect(socket: Socket) {
    const supplied = socket.handshake.auth?.token;
    let token = typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(supplied) ? supplied : '';
    let session = token ? this.sessions.get(hash(token)) : undefined;
    if (!session && this.sessions.size >= 10000) {
      socket.emit('capacity', 'This server has reached its guest profile limit.');
      socket.disconnect();
      return;
    }
    if (!session) {
      token = randomBytes(32).toString('hex');
      const id = randomBytes(12).toString('hex');
      session = {
        tokenHash: hash(token),
        profile: {
          id,
          name: `Guest ${id.slice(0, 4).toUpperCase()}`,
          avatar: avatars[randomInt(4)],
          hands: 0,
          wins: 0,
        },
        rulesets: [],
        room: null,
        lobby: 'FOURWN',
      };
      this.sessions.set(session.tokenHash, session);
    }
    const s = session;
    socket.data.session = s;
    const set = this.sockets.get(s.profile.id) ?? new Set<Socket>();
    set.add(socket);
    this.sockets.set(s.profile.id, set);
    const room = s.room ? this.rooms.get(s.room) : null;
    const player = room?.players.find((p) => p.profile.id === s.profile.id);
    if (player) {
      player.connected = true;
      player.profile = s.profile;
    }
    socket.emit('session', { token });
    let quota = 0,
      resetAt = Date.now() + 10000;
    socket.on('command', (raw: unknown, ack: (data: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (Date.now() > resetAt) {
        quota = 0;
        resetAt = Date.now() + 10000;
      }
      if (++quota > 100) {
        reply({ ok: false, error: 'Please slow down for a moment.' });
        return;
      }
      try {
        const cmd = z
          .object({
            id: z.string().min(1).max(80),
            type: z.string().max(32),
            data: z.unknown().optional(),
          })
          .parse(raw);
        const seen = this.seen.get(s.profile.id) ?? new Map<string, unknown>();
        this.seen.set(s.profile.id, seen);
        if (seen.has(cmd.id)) {
          reply(seen.get(cmd.id));
          return;
        }
        const result = this.command(s, cmd.type, cmd.data);
        const response = { ok: true, ...result };
        seen.set(cmd.id, response);
        if (seen.size > 200) seen.delete(seen.keys().next().value!);
        if (cmd.type !== 'analyze-hand') {
          this.persist();
          this.broadcast();
        }
        reply(response);
      } catch (e) {
        this.broadcast();
        reply({
          ok: false,
          error:
            e instanceof z.ZodError
              ? e.issues.map((x) => x.message).join(' ')
              : e instanceof Error
                ? e.message
                : 'Unable to process this action.',
        });
      }
    });
    socket.on('disconnect', () => {
      set.delete(socket);
      if (!set.size) {
        const r = s.room ? this.rooms.get(s.room) : null;
        const p = r?.players.find((p) => p.profile.id === s.profile.id);
        if (p) p.connected = false;
      }
      this.persist();
      this.broadcast();
    });
    this.persist();
    this.broadcast();
  }
  private command(s: Session, type: string, input: unknown): Record<string, unknown> {
    const room = s.room ? this.rooms.get(s.room) : undefined;
    const requireRoom = () => {
      if (!room) throw new Error('Join a table first.');
      return room;
    };
    const host = () => {
      const r = requireRoom();
      if (r.host !== s.profile.id) throw new Error('Only the host can do that.');
      return r;
    };
    if (type === 'create-lobby') {
      if (room) throw new Error('Leave your table before changing lobbies.');
      if (this.lobbies.size >= 100) throw new Error('The lobby limit has been reached.');
      const name = textInput.parse(input);
      let code = '';
      do {
        code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      } while (this.lobbies.has(code));
      this.lobbies.set(code, { code, name, host: s.profile.id, createdAt: Date.now() });
      s.lobby = code;
      return { code };
    }
    if (type === 'join-lobby') {
      if (room) throw new Error('Leave your table before changing lobbies.');
      const code = z.string().trim().toUpperCase().parse(input);
      if (!this.lobbies.has(code)) throw new Error('That lobby was not found.');
      s.lobby = code;
      return {};
    }
    if (type === 'profile') {
      const data = z
        .object({ name: textInput, avatar: z.enum(['jade', 'clay', 'gold', 'blue']) })
        .parse(input);
      Object.assign(s.profile, data);
      if (room) {
        const p = room.players.find((p) => p.profile.id === s.profile.id);
        if (p) p.profile = s.profile;
      }
      return {};
    }
    if (type === 'save-rules') {
      const rules = rulesSchema.parse(input);
      rules.id = rules.id in PRESETS ? randomBytes(8).toString('hex') : rules.id;
      const at = s.rulesets.findIndex((r) => r.id === rules.id);
      if (at >= 0) s.rulesets[at] = rules;
      else {
        if (s.rulesets.length >= 30) throw new Error('You can save up to 30 rulesets.');
        s.rulesets.push(rules);
      }
      return { rulesId: rules.id };
    }
    if (type === 'delete-rules') {
      const id = z.string().parse(input);
      s.rulesets = s.rulesets.filter((r) => r.id !== id);
      return {};
    }
    if (type === 'create') {
      if (room) throw new Error('Leave your current table before creating another.');
      if (this.rooms.size >= 100)
        throw new Error('All tables are occupied. Please try again shortly.');
      const data = z
        .object({ name: textInput, rules: rulesSchema, bots: z.boolean() })
        .parse(input);
      let code = '';
      do {
        code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      } while (this.rooms.has(code));
      const r: Room = {
        lobby: s.lobby,
        code,
        name: data.name,
        host: s.profile.id,
        rules: data.rules,
        players: [newPlayer(s.profile, data.rules)],
        game: null,
        createdAt: Date.now(),
      };
      if (data.bots) this.fillBots(r);
      this.rooms.set(code, r);
      s.room = code;
      if (data.bots) r.game = startGame(r.rules, r.players, -1);
      return { code };
    }
    if (type === 'configure-rules') {
      const r = requireRoom();
      if (r.host !== s.profile.id && this.lobbies.get(r.lobby)?.host !== s.profile.id)
        throw new Error('Only the table or lobby host can configure rules.');
      if (r.game) throw new Error('Rules are locked after the first deal.');
      const rules = rulesSchema.parse(input);
      r.rules = rules;
      for (const player of r.players) {
        player.points = rules.startingPoints;
        player.chips = rules.startingChips;
      }
      return {};
    }
    if (type === 'join') {
      const code = z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{6}$/)
        .parse(input)
        .toUpperCase();
      if (room) {
        if (room.code === code) return {};
        throw new Error('Leave your current table before joining another.');
      }
      const r = this.rooms.get(code);
      if (!r) throw new Error('That room code was not found.');
      const botSeat = r.players.findIndex((p) => p.bot);
      if (r.players.length === 4 && botSeat < 0) throw new Error('This table is full.');
      if (botSeat >= 0) {
        const p = r.players[botSeat];
        p.profile = s.profile;
        p.bot = false;
        p.connected = true;
        p.ready = false;
        if (r.game) event(r.game, `${s.profile.name} joined the table, taking a bot seat.`);
      } else r.players.push(newPlayer(s.profile, r.rules));
      s.room = code;
      s.lobby = r.lobby;
      return {};
    }
    if (type === 'leave') {
      const r = requireRoom(),
        seat = r.players.findIndex((p) => p.profile.id === s.profile.id);
      if (r.game) {
        const p = r.players[seat];
        p.bot = true;
        p.connected = false;
        p.ready = true;
        p.profile = {
          ...p.profile,
          id: `bot-${randomBytes(6).toString('hex')}`,
          name: `${p.profile.name} (bot)`,
        };
        event(r.game, `${s.profile.name} left. A bot will finish their seat.`);
      } else r.players.splice(seat, 1);
      s.room = null;
      if (r.host === s.profile.id) r.host = r.players.find((p) => !p.bot)?.profile.id ?? '';
      if (!r.players.some((p) => !p.bot)) this.rooms.delete(r.code);
      return {};
    }
    if (type === 'fill-bots') {
      const r = host();
      if (r.game) throw new Error('The match is in progress.');
      this.fillBots(r);
      return {};
    }
    if (type === 'start') {
      const r = host();
      if (r.game) throw new Error('The match is already in progress.');
      r.game = startGame(r.rules, r.players, -1);
      return {};
    }
    if (type === 'rematch') {
      const r = host();
      if (r.game?.phase !== 'finished') throw new Error('Finish this match first.');
      r.game = startGame(r.rules, r.players, -1);
      return {};
    }
    if (type === 'analyze-hand') {
      const r = requireRoom();
      if (!r.game) throw new Error('Deal a hand first.');
      return {
        analysis: analyzeHand(
          r.game,
          r.players.findIndex((p) => p.profile.id === s.profile.id),
        ),
      };
    }
    if (type === 'ready') {
      const r = requireRoom();
      if (r.game?.phase !== 'ended') throw new Error('The next hand is not ready yet.');
      const data = z.object({ decision: z.number().int() }).parse(input);
      if (r.game.decision !== data.decision) throw new Error('That hand has already changed.');
      r.players.find((p) => p.profile.id === s.profile.id)!.ready = true;
      tickGame(r.game);
      return {};
    }
    if (type === 'force-next-hand') {
      const r = host();
      if (r.game?.phase !== 'ended' || !r.game.rules.hostCanAdvance)
        throw new Error('Host advance is unavailable for this hand.');
      const data = z.object({ decision: z.number().int() }).parse(input);
      if (r.game.decision !== data.decision) throw new Error('That hand has already changed.');
      nextHand(r.game);
      return {};
    }
    if (type === 'action') {
      const r = requireRoom();
      if (!r.game) throw new Error('The match has not started.');
      const data = z
        .object({ decision: z.number().int(), action: z.string().max(100) })
        .parse(input);
      const old = r.game.phase;
      try {
        applyAction(
          r.game,
          r.players.findIndex((p) => p.profile.id === s.profile.id),
          data.decision,
          data.action,
        );
      } finally {
        this.recordResult(r, old);
        this.persist();
      }
      return {};
    }
    throw new Error('Unknown command.');
  }
  private fillBots(r: Room) {
    const names = ['Jun', 'Mei', 'Sora', 'Ren'];
    while (r.players.length < 4) {
      const i = r.players.length;
      r.players.push(
        newPlayer(
          {
            id: `bot-${randomBytes(6).toString('hex')}`,
            name: names[i - 1],
            avatar: avatars[i],
            hands: 0,
            wins: 0,
          },
          r.rules,
          true,
        ),
      );
    }
  }
  private recordResult(r: Room, old: string) {
    const g = r.game!;
    if (!['ended', 'finished'].includes(old) && ['ended', 'finished'].includes(g.phase))
      for (let i = 0; i < 4; i++) {
        const p = r.players[i];
        p.profile.hands++;
        if (g.result?.winner === i) p.profile.wins++;
        if (!p.bot) {
          const session = [...this.sessions.values()].find((s) => s.profile.id === p.profile.id);
          if (session) session.profile = p.profile;
        }
      }
  }
  state(s: Session): AppState {
    const room = s.room ? this.rooms.get(s.room) : undefined;
    const seat = room?.players.findIndex((p) => p.profile.id === s.profile.id) ?? -1;
    const lobbyView = (l: Lobby): LobbyView => ({
      ...l,
      members: [...this.sessions.values()].filter(
        (x) => x.lobby === l.code && !!this.sockets.get(x.profile.id)?.size,
      ).length,
      tables: [...this.rooms.values()].filter((r) => r.lobby === l.code).length,
    });
    return {
      lobby: lobbyView(this.lobbies.get(s.lobby) ?? this.lobbies.get('FOURWN')!),
      lobbies: [...this.lobbies.values()]
        .filter((l) => l.code === 'FOURWN' || l.host === s.profile.id || l.code === s.lobby)
        .map(lobbyView),
      profile: s.profile,
      rulesets: s.rulesets,
      serverTime: Date.now(),
      rooms: [...this.rooms.values()]
        .filter((r) => r.lobby === s.lobby)
        .map((r) => ({
          code: r.code,
          name: r.name,
          rulesName: r.rules.name,
          preset: r.rules.preset,
          seats: r.players.length,
          humans: r.players.filter((p) => !p.bot).length,
          bots: r.players.filter((p) => p.bot).length,
          playing: !!r.game,
          names: r.players.map((p) => p.profile.name),
        })),
      room:
        room && seat >= 0
          ? {
              code: room.code,
              name: room.name,
              host: room.host,
              rules: room.rules,
              players: room.players.map((p, i) => publicPlayer(p, i === seat)),
              game: room.game ? gameView(room.game, seat) : null,
            }
          : null,
    };
  }
  broadcast() {
    for (const set of this.sockets.values())
      for (const socket of set) socket.emit('state', this.state(socket.data.session));
  }
  private tick() {
    let changed = false;
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const g = room.game;
      if (!g) continue;
      // Pause an empty connected table. Reconnection preserves the same hand;
      // on return the existing deadline determines whether an automatic turn is due.
      if (!room.players.some((p) => !p.bot && p.connected)) continue;
      const old = g.phase;
      if (tickGame(g, now)) changed = true;
      for (let seat = 0; seat < 4; seat++)
        if (g.players[seat].bot) {
          const key = `${room.code}:${seat}`;
          let due = this.botDue.get(key);
          if (!due || due.decision !== g.decision) {
            due = { decision: g.decision, at: now + 900 + seat * 180 };
            this.botDue.set(key, due);
          }
          if (now >= due.at) {
            const a = botAction(g, seat);
            if (a) {
              applyAction(g, seat, g.decision, a, now);
              changed = true;
              due.at = now + 1200;
            }
          }
        }
      this.recordResult(room, old);
    }
    if (changed) {
      this.persist();
      this.broadcast();
    }
  }
}
