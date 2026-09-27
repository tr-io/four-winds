import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import './style.css';
import './game.css';
import { io } from 'socket.io-client';
import type { AppState, GameView, Preset, Rules } from '../shared/types';
import { PRESETS, PRESET_DETAILS } from '../shared/rules';
import { WINDS, WIND_SYMBOLS, tileName } from '../shared/tiles';
import { MahjongTable } from './table';
import { tileStatic } from './tile-art';
import { HandRack } from './hand-rack';
import { summarizeDiscards } from './discards';
import { TableEffects } from './table-effects';
function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const app = document.querySelector<HTMLDivElement>('#app')!;
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const icons: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  bot: '<rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 2v4M8 12h.01M16 12h.01M8 16h8M1 11v5m22-5v5"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  back: '<path d="m11 5-7 7 7 7M4 12h16"/>',
  sound: '<path d="m3 9 5 0 5-5v16l-5-5H3Zm13-2c4 2 4 8 0 10m3-13c7 4 7 12 0 16"/>',
  mute: '<path d="m3 9 5 0 5-5v16l-5-5H3Zm14 0 6 6m0-6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  leaf: '<path d="M20 3C7 2 2 8 6 16c8 4 14-1 14-13ZM4 21 16 8"/>',
  trophy:
    '<path d="M7 3h10v5c0 8-10 8-10 0ZM7 5H3v3c0 3 2 5 5 5m9-8h4v3c0 3-2 5-5 5M12 14v7m-5 0h10"/>',
};
const icon = (name: string, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.leaf}</svg>`;
const mark = `<svg class="wind-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="m20 1 6 13 13 6-13 6-6 13-6-13L1 20l13-6Z" fill="currentColor"/><path d="m20 11 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="var(--paper)"/></svg>`;
let state: AppState | null = null,
  page: 'play' | 'rules' | 'learn' = 'play',
  table: MahjongTable | null = null,
  mounted = '',
  selected: number | null = null,
  riichiMode = false;
let connected = false,
  offset = 0,
  activeDialog = '',
  lastResult = '',
  sound = false,
  audio: AudioContext | null = null,
  lastEvent = 0;
let knownPlayers = new Set<string>();
let rack: HandRack | null = null;
let effects: TableEffects | null = null;
let resultTimer: ReturnType<typeof setTimeout> | undefined;
let lastVisual = '';
const renderedMarkup = new WeakMap<HTMLElement, string>();
function setHTML(selector: string, html: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (element && renderedMarkup.get(element) !== html) {
    element.innerHTML = html;
    renderedMarkup.set(element, html);
  }
}
const isolatedGuest =
  new URLSearchParams(location.search).get('guest') === '1' ||
  sessionStorage.getItem('four-winds-guest') === '1';
if (isolatedGuest) {
  if (!sessionStorage.getItem('four-winds-guest')) sessionStorage.removeItem('four-winds-token');
  sessionStorage.setItem('four-winds-guest', '1');
}
const socket = io({
  auth: {
    token:
      sessionStorage.getItem('four-winds-token') ??
      (isolatedGuest ? '' : (localStorage.getItem('four-winds-token') ?? '')),
  },
  reconnection: true,
});
app.innerHTML = `<header class="site-header"><button class="brand" data-do="home">${mark}<span>Four Winds<small>THE FOUR WINDS CLUB</small></span></button><nav class="main-nav" aria-label="Main navigation"><button data-page="play" class="active">Play</button><button data-page="rules">Your rulesets</button><button data-page="learn">How to play</button></nav><div class="header-right"><span class="connection"><i></i><span id="connection-text">Connecting</span></span><button class="profile-button" data-do="profile"><span class="avatar jade" id="header-avatar">G</span><span id="profile-name">Guest</span>${icon('chevron')}</button></div></header><div id="connection-banner" role="status"></div><main id="content"></main><footer class="site-footer"><span>${mark} 東 南 西 北 · FOUR WINDS</span><span>Four players. Three traditions. One table.</span><span class="footer-safe">Play points & fake chips only.</span></footer><div id="toasts" aria-live="polite"></div><dialog id="modal"></dialog>`;
const content = document.querySelector<HTMLElement>('#content')!;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
function toast(text: string, error = false) {
  const t = document.createElement('div');
  t.className = `toast ${error ? 'error' : ''}`;
  t.textContent = text;
  document.querySelector('#toasts')!.append(t);
  setTimeout(() => t.remove(), 5000);
}
function tone(kind: 'tick' | 'claim' | 'win' = 'tick') {
  if (!sound) return;
  audio ??= new AudioContext();
  void audio.resume();
  const notes =
    kind === 'win'
      ? [392, 523.25, 659.25, 784, 1046.5]
      : kind === 'claim'
        ? [146.8, 293.7, 587.3]
        : [420];
  notes.forEach((frequency, index) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    const at = audio!.currentTime + index * (kind === 'win' ? 0.075 : 0.04);
    const duration = kind === 'win' ? 0.55 : 0.18;
    oscillator.connect(gain);
    gain.connect(audio!.destination);
    oscillator.type = kind === 'claim' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    if (kind !== 'win')
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.6, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.045, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  });
}
function command(type: string, data?: unknown): Promise<Record<string, unknown>> {
  if (!connected) {
    toast('Reconnecting. Your place at the table is saved.', true);
    return Promise.reject(new Error('offline'));
  }
  return new Promise((resolve, reject) =>
    socket
      .timeout(10000)
      .emit(
        'command',
        { id: requestId(), type, data },
        (error: Error | null, result: { ok: boolean; error?: string; [key: string]: unknown }) => {
          if (error || !result?.ok) {
            const message =
              result?.error ?? 'The connection timed out. Reconnect to check the table.';
            toast(message, true);
            reject(new Error(message));
          } else resolve(result);
        },
      ),
  );
}
socket.on('session', ({ token }: { token: string }) => {
  sessionStorage.setItem('four-winds-token', token);
  if (!isolatedGuest) localStorage.setItem('four-winds-token', token);
  socket.auth = { token };
});
socket.on('connect', () => {
  connected = true;
  connectionUI();
});
socket.on('disconnect', () => {
  connected = false;
  connectionUI();
});
socket.on('connect_error', () => {
  connected = false;
  connectionUI();
});
socket.on('state', (next: AppState) => {
  offset = next.serverTime - Date.now();
  const wasLive =
    state?.room?.code === next.room?.code && !!state?.room?.game && !state.room.game.result;
  state = next;
  const avatar = document.querySelector('#header-avatar')!;
  avatar.className = `avatar ${state.profile.avatar}`;
  avatar.textContent = state.profile.name.slice(0, 1);
  document.querySelector('#profile-name')!.textContent = state.profile.name;
  if (state.room) page = 'play';
  render();
  const g = state.room?.game;
  if (g) {
    if (!g.result && activeDialog === 'result') closeDialog();
    const newest = g.events.at(-1);
    if (newest && newest.id > lastEvent) {
      if (lastEvent > 0)
        tone(newest.type === 'win' ? 'win' : newest.type === 'claim' ? 'claim' : 'tick');
      lastEvent = newest.id;
    }
    if (g.result) {
      const id = `${state.room!.code}:${g.handNumber}`;
      if (lastResult !== id) {
        lastResult = id;
        clearTimeout(resultTimer);
        const delay =
          wasLive &&
          g.result.winner !== null &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 2200
            : 0;
        resultTimer = setTimeout(() => {
          if (
            state?.room?.code + ':' + state?.room?.game?.handNumber === id &&
            state?.room?.game?.result
          )
            showResult(state.room.game);
        }, delay);
      }
    }
  }
  if (!state.room) {
    const params = new URLSearchParams(location.search),
      room = params.get('room'),
      lobby = params.get('lobby');
    if (room || lobby) {
      history.replaceState(null, '', location.pathname);
      void command(room ? 'join' : 'join-lobby', room ?? lobby).catch(() => {});
    }
  }
});
function connectionUI() {
  document.querySelector('.connection')!.classList.toggle('offline', !connected);
  document.querySelector('#connection-text')!.textContent = connected
    ? 'Connected'
    : 'Reconnecting';
  document.querySelectorAll('[data-link-state]').forEach((el) => {
    el.textContent = connected ? 'LIVE' : 'RECONNECTING';
  });
  document.querySelector('#connection-banner')!.innerHTML = connected
    ? ''
    : `<div class="reconnect-banner">${icon('globe')} Connecting to the table. Your seat will be restored automatically.</div>`;
}
function disposeTable() {
  rack?.dispose();
  rack = null;
  effects?.dispose();
  effects = null;
  clearTimeout(resultTimer);
  lastVisual = '';
  table?.dispose();
  table = null;
}
function mountScene(id: string, preview: boolean) {
  try {
    table = new MahjongTable(document.getElementById(id)!, preview);
  } catch {
    document.getElementById(id)!.innerHTML =
      `<div class="canvas-fallback">${mark}<p>Your table is ready.</p><small>Use the tile controls below to play.</small></div>`;
  }
}
function render() {
  document.body.classList.toggle('in-game', !!state?.room);
  document
    .querySelectorAll('[data-page]')
    .forEach((b) => b.classList.toggle('active', b.getAttribute('data-page') === page));
  if (state?.room) {
    renderRoom();
    return;
  }
  const key = page;
  if (mounted !== key) {
    disposeTable();
    mounted = key;
    knownPlayers.clear();
    if (page === 'play') {
      content.innerHTML = lobbyHTML();
      mountScene('hero-table', true);
    } else if (page === 'learn') content.innerHTML = learnHTML();
  }
  if (page === 'play') {
    document.querySelector('#lobby-label')!.textContent =
      state?.lobby.name ?? 'The Four Winds Club';
    document.querySelector('#lobby-presence')!.textContent = state
      ? `${state.lobby.members} here · ${state.lobby.tables} ${state.lobby.tables === 1 ? 'table' : 'tables'}`
      : 'A seat is waiting for you';
    renderRoomList();
  }
  if (page === 'rules') content.innerHTML = rulesPageHTML();
}
function lobbyHTML() {
  return `<section class="lobby-top"><div class="lobby-name"><span class="section-dot"></span><button data-do="lobbies"><span id="lobby-label">The Four Winds Club</span>${icon('chevron')}</button><span class="soft-label" id="lobby-presence">A seat is waiting for you</span></div><button class="text-button" data-do="create-lobby">${icon('plus')} Create a lobby</button></section>
<section class="hero"><div class="hero-copy"><span class="eyebrow light"><span></span> 四風 · MULTIPLAYER MAHJONG</span><h1>Read the table.<br>Rule the <em>winds.</em></h1><p>Three traditions. Four rivals. Your next winning hand.<br>Challenge friends or sharpen your game against bots.</p><div class="hero-actions"><button class="button gold" data-do="create">Create a table ${icon('diagonal')}</button><button class="button glass" data-do="join">Join with a code</button></div><div class="hero-foot">${icon('users')} DRAW. CALL. CONQUER.<span class="tiny-star">✦</span></div></div><div class="hero-visual"><div class="hero-halo"></div><div id="hero-table"></div><div class="table-label"><span class="live-dot"></span> THE TABLE IS SET <span>東 南 西 北</span></div><div class="floating-tile one">${tileStatic(132)}</div><div class="floating-tile two">${tileStatic(76)}</div></div></section>
<section class="traditions"><div class="section-heading"><div><span class="eyebrow">SAME TABLE. DIFFERENT TRADITIONS.</span><h2>Choose your discipline.</h2></div><button class="text-button" data-page="learn">Explore the rules ${icon('arrow')}</button></div><div class="preset-grid">${(['mcr', 'riichi', 'singapore'] as Preset[]).map((p, i) => presetCard(p, i)).join('')}</div></section>
<section class="open-tables"><div class="section-heading"><div class="heading-inline"><h2>Live tables.</h2><span class="soft-label">Your lobby’s tables</span></div><button class="text-button" data-do="share-lobby">${icon('copy')} Invite to lobby</button></div><div class="lobby-bottom"><div class="rooms-panel"><div class="room-list-head"><span>TABLE</span><span>TRADITION</span><span>SEATS</span><span></span></div><div id="room-list"></div></div><div class="practice-card"><div class="practice-icon">${icon('bot')}</div><div><span class="eyebrow">TRAINING TABLE</span><h3>Sharpen your instincts.</h3><p>Take on three bots. Learn the patterns. Plan your next call.</p><button class="text-button" data-do="practice">Play with bots ${icon('arrow')}</button></div></div></div></section>`;
}
function presetCard(p: Preset, i: number) {
  const d = PRESET_DETAILS[p];
  const tiles = [
    [0, 12, 32],
    [132, 128, 124],
    [136, 144, 140],
  ][i];
  return `<button class="preset-card preset-${p}" data-preset="${p}"><div class="preset-top"><span class="eyebrow">${d.region}</span><span class="preset-index">0${i + 1}</span></div><div class="preset-art">${tiles.map((t, j) => tileStatic(t, `art-tile art-${j}`)).join('')}<div class="art-watermark">${['和', '立', '花'][i]}</div></div><div class="preset-content"><h3>${PRESETS[p].name}</h3><p>${d.description}</p><div class="preset-bottom"><span>${d.tiles} tiles <b>·</b> ${d.minimum}</span><span class="circle-arrow">${icon('arrow')}</span></div></div></button>`;
}
function renderRoomList() {
  const element = document.querySelector('#room-list');
  if (!element) return;
  const rooms = state?.rooms ?? [];
  element.innerHTML = rooms.length
    ? rooms
        .map(
          (r) =>
            `<div class="room-row"><div><strong>${esc(r.name)}</strong><small>${esc(r.names.slice(0, 2).join(', '))}${r.names.length > 2 ? ' & friends' : ''}</small></div><span class="rule-pill ${r.preset}">${esc(r.rulesName)}</span><span class="seat-count">${icon('users')} ${r.humans}/4 <small>${r.bots ? `+ ${r.bots} bots` : r.playing ? 'Playing' : 'Open'}</small></span><button class="icon-button" data-join="${r.code}" aria-label="Join ${esc(r.name)}" ${r.humans === 4 ? 'disabled' : ''}>${icon('arrow')}</button></div>`,
        )
        .join('')
    : `<div class="empty-tables"><div class="empty-icon">${icon('users')}</div><div><strong>Be the first to deal.</strong><p>Create one and invite your people. Bots can keep you company.</p></div><button class="button outline small" data-do="create">Open a table ${icon('plus')}</button></div>`;
}
function roomShell() {
  return `<section class="game-window" aria-label="Mahjong game window">
    <header class="game-toolbar"><button class="icon-button" data-do="leave" aria-label="Leave table">${icon('back')}</button><div class="game-wordmark">四風 <span>FOUR WINDS</span></div><div class="table-title"><strong id="room-title"></strong><span id="room-rules" class="rule-pill"></span></div><div class="game-tools"><span class="game-connection" data-link-state>${connected ? 'LIVE' : 'RECONNECTING'}</span><button class="text-button room-code-button" data-do="share-room" aria-label="Copy table invitation">${icon('copy')} <span id="room-code"></span></button><button class="icon-button" data-do="log" aria-label="Game log" aria-expanded="false">${icon('clock')}</button><button class="icon-button" data-do="sound" aria-label="Toggle game sounds">${icon(sound ? 'sound' : 'mute')}</button><button class="icon-button" data-do="help" aria-label="Table help">${icon('book')}</button><button class="icon-button fullscreen-button" data-do="fullscreen" aria-label="Toggle fullscreen">${icon('diagonal')}</button></div></header>
    <div class="board-area"><div class="game-table table-entrance"><div class="table-grain"></div><div class="game-meta" id="game-meta"></div><div id="live-table"></div><div id="seat-overlays"></div><div id="table-status"></div><div id="table-effects" aria-live="polite"></div>
      <div class="discard-inspector" id="discard-inspector"><button class="discard-trigger" data-do="discards" aria-label="Show discarded tiles" aria-expanded="false" aria-controls="discard-ledger"><span>河</span><small>DISCARDS</small></button><section class="discard-ledger" id="discard-ledger" aria-label="Discarded tiles" hidden><header><div><strong>Discard ledger</strong><small>All seats · sorted by suit and rank</small></div><button class="icon-button" data-do="close-discards" aria-label="Close discarded tiles">${icon('close')}</button></header><div id="discard-groups"></div><p>Counts include called tiles. “Called” tiles are now in exposed melds.</p></section></div>
    </div><aside class="game-drawer" id="game-drawer" hidden><header><strong>TABLE RECORD</strong><button class="icon-button" data-do="log" aria-label="Close game log">${icon('close')}</button></header><div id="table-sidebar"></div><div id="log-entries" role="log" aria-label="Game log"></div></aside></div>
    <section id="hand-area" class="game-dock" aria-label="Your hand and actions"><div id="waiting-controls"></div><div id="playing-controls"><div id="action-dock"></div><div class="hand-header"><div id="hand-guidance"></div><div class="rack-tools"><span class="your-wind" id="your-wind"></span><button class="text-button" data-do="sort" aria-label="Sort tiles by suit and rank">Sort tiles ${icon('chevron')}</button></div></div><p id="rack-instructions" class="sr-only">Drag to arrange your tiles. With a tile focused, use Alt and Left or Right to move it. Select a playable tile, then press Discard.</p><div class="hand-tiles" role="group" aria-label="Your concealed tiles"></div><div id="exposed-hand" class="exposed-hand"></div><span class="sr-only" id="rack-announcement" role="status"></span></div></section>
  </section>`;
}
function renderRoom() {
  const room = state!.room!,
    g = room.game;
  const key = `room:${room.code}`;
  if (mounted !== key) {
    disposeTable();
    mounted = key;
    selected = null;
    riichiMode = false;
    knownPlayers.clear();
    content.innerHTML = roomShell();
    mountScene('live-table', false);
    rack = new HandRack(document.querySelector('.hand-tiles')!, (message) => {
      document.querySelector('#rack-announcement')!.textContent = message;
    });
    effects = new TableEffects(document.querySelector('#table-effects')!);
    bindDiscardInspector();
  }
  document.querySelector('#room-title')!.textContent = room.name;
  document.querySelector('#room-rules')!.textContent = room.rules.name;
  document.querySelector('#room-code')!.textContent = room.code;
  if (g) {
    table?.update(g);
    renderGame(g);
  } else renderWaiting();
}
function avatarHTML(name: string, color: string, bot = false) {
  return `<span class="avatar ${color}">${bot ? icon('bot') : esc(name.slice(0, 1).toUpperCase())}</span>`;
}
function renderWaiting() {
  const room = state!.room!;
  document.querySelector('#game-meta')!.innerHTML =
    `<span class="eyebrow light">PREPARE TO PLAY</span><span class="table-tag">${room.players.length} of 4 seats filled</span>`;
  document.querySelector('#seat-overlays')!.innerHTML = Array.from({ length: 4 }, (_, i) => {
    const p = room.players[i];
    return `<div class="player-badge position-${i} ${p ? '' : 'empty-seat'} ${p && !knownPlayers.has(p.profile.id) ? 'player-arrival' : ''}" style="--arrival-delay:${i * 90}ms">${p ? avatarHTML(p.profile.name, p.profile.avatar, p.bot) : '<span class="avatar empty">+</span>'}<div><strong>${p ? esc(p.profile.name) : 'An open seat'}</strong><small>${p ? (p.bot ? 'Practice partner' : p.connected ? 'Ready to play' : 'Reconnecting') : 'Invite a friend'}</small></div><span class="seat-wind">${WIND_SYMBOLS[i]}</span></div>`;
  }).join('');
  knownPlayers = new Set(room.players.map((p) => p.profile.id));
  document.querySelector('#table-status')!.innerHTML =
    `<div class="waiting-message"><span>EAST · SOUTH · WEST · NORTH</span><h2>The four winds gather.</h2><p>Share code <strong>${room.code}</strong> or add bots to fill the table.</p></div>`;
  document.querySelector<HTMLElement>('#playing-controls')!.hidden = true;
  document.querySelector<HTMLElement>('#waiting-controls')!.hidden = false;
  document.querySelector<HTMLElement>('#discard-inspector')!.hidden = true;
  document.querySelector('#waiting-controls')!.innerHTML =
    `<div class="waiting-actions">${room.host === state!.profile.id ? `<button class="button outline" data-do="fill-bots" ${room.players.length === 4 ? 'disabled' : ''}>${icon('bot')} Fill seats with bots</button><button class="button primary" data-do="start" ${room.players.length < 4 ? 'disabled' : ''}>Start the game ${icon('arrow')}</button>` : `<span>Waiting for the host to start the hand.</span>`}<button class="text-button" data-do="share-room">${icon('copy')} Copy invitation</button></div>`;
  document.querySelector('#table-sidebar')!.innerHTML = tableInfoHTML(room.rules);
  document.querySelector('#log-entries')!.innerHTML =
    '<p class="log-empty">Waiting for the first deal.</p>';
}
function tableInfoHTML(r: Rules) {
  return `<div class="table-info"><span class="eyebrow">HOUSE RULES</span><h3>${esc(r.name)}</h3><div><span>Claim window</span><strong>${r.claimSeconds}s</strong></div><div><span>Turn clock</span><strong>${r.turnSeconds}s</strong></div><div><span>Match length</span><strong>${r.rounds} ${r.rounds === 1 ? 'wind' : 'winds'}</strong></div><div><span>Minimum</span><strong>${r.minimum} ${r.preset === 'riichi' ? 'han' : r.preset === 'singapore' ? 'tai' : 'fan'}</strong></div><div><span>Fake chips</span><strong>${r.chips ? 'On' : 'Off'}</strong></div><button class="text-button" data-do="help">View table rules ${icon('arrow')}</button></div>`;
}
function renderGame(g: GameView) {
  const me = g.players[g.seat],
    playing = g.phase === 'playing',
    myTurn = playing && g.turn === g.seat;
  document.querySelector('#game-meta')!.innerHTML =
    `<span class="round-label"><span>${WIND_SYMBOLS[g.round]}</span> ${WINDS[g.round]} ${g.rotation + 1}<small>HAND ${g.handNumber}${g.honba ? ` · ${g.honba} HONBA` : ''}</small></span><div class="table-meta-right">${g.dora.length ? `<span class="dora-label">DORA INDICATORS ${g.dora.map((t) => tileStatic(t, 'mini')).join('')}</span>` : ''}<span class="table-tag">${g.wallCount} tiles in the wall</span></div>`;
  const arrived = g.players.filter((p) => !knownPlayers.has(p.profile.id));
  document.querySelector('#seat-overlays')!.innerHTML = g.players
    .map((p, i) => {
      const relative = (i - g.seat + 4) % 4,
        active = playing && g.turn === i,
        newcomer = arrived.includes(p);
      return `<div class="player-badge position-${relative} ${active ? 'current-player' : ''} ${newcomer ? 'player-arrival' : ''}" style="--arrival-delay:${relative * 110}ms">${avatarHTML(p.profile.name, p.profile.avatar, p.bot)}<div><strong>${esc(p.profile.name)} ${i === g.seat ? '<em>you</em>' : ''}</strong><small>${p.riichi ? '<b class="riichi-badge">RIICHI</b> ' : ''}${g.rules.points ? `${p.points.toLocaleString()} pts` : p.bot ? 'Bot' : p.connected ? 'Connected' : 'Reconnecting'}${g.rules.chips ? ` · ${p.chips.toLocaleString()} chips` : ''}</small></div><span class="seat-wind">${WIND_SYMBOLS[(i - g.dealer + 4) % 4]}</span>${active ? `<span class="seat-timer" data-countdown="${g.turnDeadline}"></span>` : ''}${!p.bot ? `<i class="seat-online ${p.connected ? '' : 'away'}"></i>` : ''}</div>`;
    })
    .join('');
  knownPlayers = new Set(g.players.map((p) => p.profile.id));
  document.querySelector('#table-status')!.innerHTML =
    g.phase === 'claim'
      ? `<div class="board-call-status">CLAIM WINDOW <strong data-countdown="${g.claim!.deadline}"></strong></div>`
      : g.phase === 'ended' || g.phase === 'finished'
        ? `<button class="table-result-button" data-do="result">${icon('trophy')} ${g.result!.winner === null ? 'A hand drawn' : `${esc(g.players[g.result!.winner].profile.name)} wins`} <span>View hand ${icon('arrow')}</span></button>`
        : '';
  document.querySelector<HTMLElement>('#playing-controls')!.hidden = false;
  document.querySelector<HTMLElement>('#waiting-controls')!.hidden = true;
  document.querySelector<HTMLElement>('#discard-inspector')!.hidden = false;
  if (selected !== null && !me.hand.includes(selected)) selected = null;
  const discardable = g.actions
    .filter((a) => a.kind === (riichiMode ? 'riichi' : 'discard'))
    .map((a) => a.tiles[0]);
  if (selected !== null && !discardable.includes(selected)) selected = null;
  const specials = g.actions.filter(
    (a) => !['discard', 'riichi', 'pass'].includes(a.kind) || a.id === 'end-hand',
  );
  const isClaim = g.phase === 'claim';
  const assessment = g.winAssessment;
  const blocked = assessment && assessment.qualifying < assessment.minimum;
  const guidance = isClaim
    ? g.claim?.submitted
      ? `Call received: ${g.claim.submitted}. Resolving priority…`
      : g.actions.length
        ? 'CALL THE TILE'
        : 'Another player can call…'
    : myTurn
      ? riichiMode
        ? 'Choose your riichi discard'
        : 'YOUR TURN'
      : playing
        ? `${esc(g.players[g.turn].profile.name)}’s turn`
        : 'HAND COMPLETE';
  setHTML(
    '#hand-guidance',
    `<span class="turn-label ${myTurn || (isClaim && g.actions.length) ? 'your-turn' : ''}">${guidance}</span>${assessment ? `<button class="score-hint ${blocked ? 'below-minimum' : 'qualified'}" data-do="win-check">${blocked ? 'Complete shape' : 'Hand qualifies'} · ${assessment.qualifying}/${assessment.minimum} fan ${icon('book')}</button>` : '<span class="rack-tip">Drag tiles to arrange</span>'}`,
  );
  document.querySelector('#your-wind')!.textContent =
    `${WIND_SYMBOLS[(g.seat - g.dealer + 4) % 4]} ${WINDS[(g.seat - g.dealer + 4) % 4]}`;
  rack?.sync(
    `${state!.room!.code}:${g.handNumber}:${me.profile.id}`,
    me.hand,
    me.drawn,
    discardable,
    selected,
  );
  setHTML(
    '#exposed-hand',
    `${me.melds
      .map(
        (m) =>
          `<div class="exposed-meld"><small>${m.concealed ? 'closed ' : ''}${m.kind}</small>${[
            ...m.tiles,
          ]
            .sort((a, b) => a - b)
            .map((t) => tileStatic(t, 'mini'))
            .join('')}</div>`,
      )
      .join('')}${
      me.bonuses.length
        ? `<div class="exposed-meld"><small>flowers & bonuses</small>${[...me.bonuses]
            .sort((a, b) => a - b)
            .map((t) => tileStatic(t, 'mini'))
            .join('')}</div>`
        : ''
    }`,
  );
  setHTML(
    '#action-dock',
    `<div class="action-bar ${isClaim ? 'claim-active' : ''}"><div class="action-context">${isClaim ? `${tileStatic(g.claim!.tile, 'claim-tile')}<div><strong>${g.claim?.submitted ? 'CALL LOCKED IN' : g.actions.length ? 'MAKE YOUR CALL' : 'CLAIM PENDING'}</strong><small>${esc(g.players[g.claim!.from].profile.name)} ${g.claim!.reason === 'discard' ? 'discarded' : 'declared a kong'} · <b data-countdown="${g.claim!.deadline}"></b></small></div>` : myTurn ? `<span class="turn-seal">打</span><div><strong>${blocked ? 'MORE FAN NEEDED' : g.actions.some((a) => a.kind === 'win') ? 'WINNING HAND' : 'CHOOSE YOUR DISCARD'}</strong><small>${blocked ? `${assessment!.qualifying} of ${assessment!.minimum} qualifying fan · flowers do not qualify` : 'Select a tile, then discard'} <b data-countdown="${g.turnDeadline}"></b></small></div>` : `<span class="turn-seal">${g.phase === 'ended' || g.phase === 'finished' ? '和' : '風'}</span><div><strong>${g.phase === 'ended' || g.phase === 'finished' ? 'HAND COMPLETE' : 'TABLE IN PLAY'}</strong><small>${isClaim ? 'Resolving calls' : 'Arrange your tiles while you wait'}</small></div>`}</div><div class="action-buttons">${specials.map((a) => `<button class="button ${a.kind === 'win' ? 'gold win-action' : 'primary'}" data-action="${a.id}">${a.tiles.length && a.kind !== 'win' ? a.tiles.map((t) => tileStatic(t, 'tiny')).join('') : a.kind === 'win' ? '<span class="action-glyph">和</span>' : ''}<span>${esc(a.label)}</span></button>`).join('')}${isClaim && g.actions.some((a) => a.kind === 'pass') ? '<button class="button outline" data-action="pass">Pass</button>' : ''}${g.actions.some((a) => a.kind === 'riichi') ? `<button class="button ${riichiMode ? 'primary' : 'outline'}" data-do="riichi">${riichiMode ? 'Cancel riichi' : 'Declare riichi'}</button>` : ''}${myTurn ? `<button class="button primary discard-button" data-do="discard" ${selected === null ? 'disabled' : ''}>${selected !== null ? `${riichiMode ? 'Riichi · ' : ''}Discard ${esc(tileName(selected))}` : 'Select a tile'} ${icon('arrow')}</button>` : g.phase === 'ended' ? `<button class="button primary" data-do="ready" ${me.ready ? 'disabled' : ''}>${me.ready ? 'Ready · waiting' : 'Ready for the next hand'} ${icon('arrow')}</button>` : g.phase === 'finished' && state!.room!.host === state!.profile.id ? `<button class="button primary" data-do="rematch">Play another match ${icon('arrow')}</button>` : ''}</div>${isClaim ? `<div class="claim-time-bar"><i data-progress="${g.claim!.deadline}" data-duration="${g.rules.claimSeconds * 1000}"></i></div>` : ''}</div>`,
  );
  renderDiscardLedger(g);
  renderCallEffect(g);
  document.querySelector('#table-sidebar')!.innerHTML = tableInfoHTML(g.rules);
  document.querySelector('#log-entries')!.innerHTML = [...g.events]
    .reverse()
    .slice(0, 35)
    .map(
      (e) =>
        `<div class="log-entry ${e.type}"><span class="log-symbol">${e.type === 'win' ? '✦' : e.type === 'claim' ? '↗' : e.type === 'bonus' ? '❀' : '·'}</span><div><p>${esc(e.text)}</p><time>${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>${e.tile !== undefined ? tileStatic(e.tile, 'tiny') : ''}</div>`,
    )
    .join('');
  updateClocks();
}
function renderDiscardLedger(g: GameView) {
  const groups = summarizeDiscards(g.players);
  setHTML(
    '#discard-groups',
    groups.length
      ? groups
          .map(
            ({ tile, count, claimed }) =>
              `<div class="discard-group ${count === 4 ? 'all-seen' : ''}" data-kind="${Math.floor(tile / 4)}" aria-label="${esc(tileName(tile))}: ${count} discarded${claimed ? `, ${claimed} called` : ''}">${tileStatic(tile)}<strong>${count}<span> / 4</span></strong><small>${esc(tileName(tile))}</small>${claimed ? `<em>${claimed} called</em>` : ''}</div>`,
          )
          .join('')
      : '<p class="ledger-empty">The river is empty.<br>Discarded tiles will collect here.</p>',
  );
}
function setDiscardsOpen(open: boolean) {
  const ledger = document.querySelector<HTMLElement>('#discard-ledger');
  if (ledger) ledger.hidden = !open;
  document.querySelector('.discard-trigger')?.setAttribute('aria-expanded', String(open));
}
function closeDiscards() {
  const inspector = document.querySelector<HTMLElement>('#discard-inspector');
  if (inspector) inspector.dataset.pinned = '';
  setDiscardsOpen(false);
}
function toggleDiscards() {
  const inspector = document.querySelector<HTMLElement>('#discard-inspector')!;
  inspector.dataset.pinned = inspector.dataset.pinned ? '' : 'true';
  setDiscardsOpen(!!inspector.dataset.pinned);
}
function bindDiscardInspector() {
  const inspector = document.querySelector<HTMLElement>('#discard-inspector')!;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  inspector.addEventListener('pointerenter', (event) => {
    clearTimeout(leaveTimer);
    if (event.pointerType === 'mouse') setDiscardsOpen(true);
  });
  inspector.addEventListener('pointerleave', () => {
    leaveTimer = setTimeout(() => {
      if (!inspector.dataset.pinned && !inspector.contains(document.activeElement))
        setDiscardsOpen(false);
    }, 180);
  });
  inspector.addEventListener('focusin', () => setDiscardsOpen(true));
  inspector.addEventListener('focusout', (event) => {
    if (!inspector.dataset.pinned && !inspector.contains(event.relatedTarget as Node))
      setDiscardsOpen(false);
  });
  inspector.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      document.querySelector<HTMLElement>('.discard-trigger')!.focus();
      closeDiscards();
    }
  });
}
function showWinCheck() {
  const a = state?.room?.game?.winAssessment;
  if (!a) return;
  openDialog(
    'win-check',
    a.qualifying >= a.minimum ? 'Your hand qualifies.' : 'Complete shape. More fan needed.',
    `<div class="qualification-total"><strong>${a.qualifying}<small> / ${a.minimum} qualifying fan</small></strong></div><p class="dialog-intro">Four sets and a pair complete the shape. This table also requires ${a.minimum} fan from scoring patterns before flowers are added.</p><div class="score-patterns">${a.patterns.map((p) => `<div><span>${esc(p.name)}</span><strong>+${p.value}</strong></div>`).join('')}<div><span>Flowers & seasons · added after qualification</span><strong>+${a.flowers}</strong></div></div><p class="form-note">For basic-hand play, create a house ruleset with Minimum fan set to 0 before opening a table. The official MCR preset uses 8.</p><button class="button primary full" data-do="close">Back to the hand</button>`,
  );
}
function renderCallEffect(g: GameView) {
  const now = Date.now() + offset;
  const win = g.result?.winner;
  if (win !== undefined && win !== null) {
    const event = [...g.events].reverse().find((e) => e.type === 'win');
    const id = `${state!.room!.code}:${g.handNumber}:win`;
    if (id !== lastVisual && event && now - event.at < 3000) {
      lastVisual = id;
      effects?.play(
        id,
        'win',
        g.players[win].profile.name,
        `${g.result!.score?.value ?? ''} ${g.result!.score?.unit ?? ''} · ${g.result!.reason}`,
      );
      table?.impact(true);
    }
  } else if (g.lastClaim && now - g.lastClaim.at < 2000) {
    const c = g.lastClaim;
    const id = `${state!.room!.code}:${g.handNumber}:${c.at}:${c.kind}:${c.seat}`;
    if (id !== lastVisual) {
      lastVisual = id;
      effects?.play(id, c.kind, g.players[c.seat].profile.name, `${tileName(c.tile)} · claim won`);
      table?.impact(false);
    }
  }
}
function updateClocks() {
  const now = Date.now() + offset;
  document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
    el.textContent = `${Math.max(0, Math.ceil((Number(el.dataset.countdown) - now) / 1000))}s`;
  });
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, ((Number(el.dataset.progress) - now) / Number(el.dataset.duration)) * 100))}%`;
  });
  document.querySelectorAll<HTMLElement>('[data-expire]').forEach((el) => {
    if (now > Number(el.dataset.expire)) el.remove();
  });
}
setInterval(updateClocks, 150);

function openDialog(name: string, title: string, body: string, wide = false) {
  activeDialog = name;
  modal.className = wide ? 'wide-dialog' : '';
  modal.innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">FOUR WINDS</span><h2>${title}</h2></div><button class="icon-button" data-do="close" aria-label="Close dialog">${icon('close')}</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
function closeDialog() {
  modal.close();
  activeDialog = '';
}
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      closeDialog();
  }
});
function ruleOptions(selectedId = 'singapore') {
  return [...Object.values(PRESETS), ...(state?.rulesets ?? [])]
    .map(
      (r) =>
        `<option value="${esc(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${esc(r.name)}${r.id in PRESETS ? '' : ' · custom'}</option>`,
    )
    .join('');
}
function showCreate(preset = 'singapore', practice = false) {
  openDialog(
    'create',
    practice ? 'A table just for you.' : 'Make room for a good game.',
    `<p class="dialog-intro">${practice ? 'Three friendly bots are ready. Friends can take their seats whenever they join.' : 'Invite friends with a room code. Every empty seat can have a bot until a friend arrives.'}</p><form id="create-form"><label>TABLE NAME<input name="name" maxlength="24" value="${esc(practice ? 'A quiet practice hand' : `${state?.profile.name ?? 'Our'}’s table`)}" required/></label><label>RULESET<select name="rules" aria-label="RULESET">${ruleOptions(preset)}</select></label><label class="check-row"><input type="checkbox" name="bots" ${practice ? 'checked' : ''}/><span><strong>Fill empty seats with bots</strong><small>Start immediately. Joining friends replace bots.</small></span>${icon('bot')}</label><div class="form-note">${icon('leaf')} ${esc(state?.lobby.name ?? 'The Four Winds Club')} · Fake chips only</div><button class="button primary full" type="submit">${practice ? 'Take your seat' : 'Create table'} ${icon('arrow')}</button></form>`,
  );
}
function showJoin() {
  openDialog(
    'join',
    'Your seat is waiting.',
    `<p class="dialog-intro">Enter the six-character table code from a friend.</p><form id="join-form"><label>TABLE CODE<input class="code-input" name="code" placeholder="A1B2C3" pattern="[A-Za-z0-9]{6}" maxlength="6" autocomplete="off" required/></label><button class="button primary full">Join the table ${icon('arrow')}</button></form>`,
  );
}
function showProfile() {
  if (!state) return;
  const p = state.profile;
  openDialog(
    'profile',
    'A familiar face.',
    `<form id="profile-form"><div class="profile-preview">${avatarHTML(p.name, p.avatar)}<div><strong>Your place in the club</strong><small>${p.hands} hands played · ${p.wins} wins</small></div></div><label>DISPLAY NAME<input name="name" maxlength="24" value="${esc(p.name)}" required/></label><label>YOUR COLOR</label><div class="avatar-picker">${['jade', 'clay', 'gold', 'blue'].map((c) => `<label><input type="radio" name="avatar" value="${c}" ${p.avatar === c ? 'checked' : ''}/><span class="avatar ${c}">${esc(p.name.slice(0, 1))}</span><small>${c}</small></label>`).join('')}</div><p class="form-note">Your profile and saved rules stay in this browser. Reconnect to keep your seat.</p><button class="button primary full">Save profile ${icon('check')}</button></form>`,
  );
}
function showLobbies() {
  if (!state) return;
  openDialog(
    'lobbies',
    'Find your gathering place.',
    `<p class="dialog-intro">Lobbies group your tables together. Share a lobby code to bring your people into the same space.</p><div class="lobby-choices">${state.lobbies.map((l) => `<button data-lobby="${l.code}" class="lobby-choice"><span class="lobby-choice-icon">${icon('users')}</span><span><strong>${esc(l.name)}</strong><small>${l.members} here · ${l.tables} tables · ${l.code}</small></span>${l.code === state!.lobby.code ? icon('check') : icon('arrow')}</button>`).join('')}</div><form id="join-lobby-form" class="inline-form"><input name="code" maxlength="6" placeholder="Lobby code" aria-label="Lobby code" required/><button class="button primary">Join lobby</button></form><button class="button outline full" data-do="create-lobby">${icon('plus')} Create your own lobby</button>`,
  );
}
function showCreateLobby() {
  openDialog(
    'create-lobby',
    'Bring your people together.',
    `<p class="dialog-intro">Create a lobby with its own room list and invitation code. Open as many tables as your group needs.</p><form id="lobby-form"><label>LOBBY NAME<input name="name" maxlength="24" placeholder="Sunday Mahjong Club" required/></label><button class="button primary full">Create lobby ${icon('arrow')}</button></form>`,
  );
}
function helpBody(r?: Rules) {
  const preset = r?.preset ?? 'singapore';
  return `<div class="help-body"><div class="help-lead">${mark}<p>Four players, a wall of tiles,<br>and a little possibility in every draw.</p></div><ol class="help-steps"><li><strong>Build a winning hand.</strong><p>Usually four sets and a pair: three identical tiles (pung), three consecutive suited tiles (chow), or four identical tiles (kong). Special hands depend on the tradition.</p></li><li><strong>Draw, consider, discard.</strong><p>Your draw arrives automatically. Drag tiles to arrange them, or use Alt + Left/Right on a focused tile. Sort tiles restores suit order. Select a tile, then press Discard. If your turn expires, the server discards your drawn tile. Tap any tile to see its name.</p></li><li><strong>See a tile you need? Make a call.</strong><p>Every legal win, pung, kong, and chow appears in the action dock inside the game window. Hover, focus, or tap the center seal to inspect discarded tiles and counts. Chows come only from the player before you. Choose a sequence when several chows are legal.</p></li><li><strong>Let the table resolve the call.</strong><p>Wins have first priority. ${r?.meldPriority === 'equal' ? 'All meld calls share priority.' : r?.meldPriority === 'chow-first' ? 'Chows precede pungs and kongs.' : 'Pungs and kongs precede chows.'} The earliest valid click received by the server wins a tie. A lower-priority claim waits for possible higher claims. ${r?.claimSeconds ?? 8} seconds to respond; silence passes.</p></li></ol><div class="help-variant"><span class="eyebrow">${esc(r?.name ?? PRESETS[preset].name)}</span><h3>${PRESET_DETAILS[preset].subtitle}</h3><p>${preset === 'riichi' ? 'A yaku is required; dora alone cannot win. Declare riichi on a closed, ready hand, then discard only your draws. Furiten blocks ron when your waits include your own discards or when you have passed a winning tile. The fourteen-tile dead wall supplies kan draws and dora.' : preset === 'mcr' ? 'Reach eight fan before counting flowers. The scoring engine considers MCR patterns, including seven pairs, knitted hands, and thirteen orphans. Flowers are exposed and replaced automatically. The dealer advances after every hand.' : 'Flowers, seasons, and animals reveal and replace automatically. Own flowers and every animal add tai. Cat–rat and rooster–centipede pairs earn instant points. The default needs one tai, capped at five. Complete dragon/wind sets and flower collections can win special hands.'}</p><small>${PRESET_DETAILS[preset].source}</small></div>${r ? `<div class="help-variant"><span class="eyebrow">THIS TABLE</span><p>${r.rounds} winds · ${r.turnSeconds}s turns · ${r.claimSeconds}s claims · ${r.minimum} minimum ${r.preset === 'riichi' ? 'han' : r.preset === 'singapore' ? 'tai' : 'fan'} · ${r.scoreMultiplier}× point settlement.</p><p>Chows ${r.allowChow ? 'on' : 'off'} · Kongs ${r.allowKong ? 'on' : 'off'} · Seven pairs ${r.sevenPairs ? 'on' : 'off'}.</p><p>${r.chips ? `Each point changes your fake chips by ${r.chipsPerPoint}. You start with ${r.startingChips.toLocaleString()} fake chips.` : 'Fake chips are off.'} ${r.points ? 'Points are tracked.' : 'Point totals are off; qualifying scores still apply.'}</p>${r.houseBonuses.map((b) => `<p><strong>${esc(b.name)}</strong>: +${b.points} ${r.preset === 'riichi' ? 'points' : r.preset === 'mcr' ? 'fan' : 'tai'} for ${b.condition}.</p>`).join('')}</div>` : ''}<p class="help-source">Compare the <a href="https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf" target="_blank" rel="noopener">MCR rulebook</a>, <a href="https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf" target="_blank" rel="noopener">EMA 2025 rules</a>, and <a href="https://singaporemahjong.com/rules/" target="_blank" rel="noopener">Singapore source</a>. Four Winds uses the online adaptations and Singapore profile documented in the project.</p><div class="form-note">${icon('leaf')} Points and chips are for play. No real money, payments, or cash-out.</div></div>`;
}
function learnHTML() {
  return `<section class="learn-page"><div class="page-title"><span class="eyebrow">A TRADITION WORTH SHARING</span><h1>A few tiles.<br>A world of possibilities.</h1><p>You don’t need to know everything to take a seat.</p></div><div class="learn-grid">${(['mcr', 'riichi', 'singapore'] as Preset[]).map((p) => `<article class="learn-card"><h2>${PRESETS[p].name}</h2>${helpBody(PRESETS[p])}<button class="button primary" data-preset="${p}">Play this tradition ${icon('arrow')}</button></article>`).join('')}</div></section>`;
}
function showResult(g: GameView) {
  const r = g.result!;
  openDialog(
    'result',
    r.winner === null ? 'A hand drawn.' : `${esc(g.players[r.winner].profile.name)} wins!`,
    `<div class="result-banner ${r.winner !== null ? 'victory' : ''}">${icon(r.winner !== null ? 'trophy' : 'leaf')}<span>${esc(r.reason)}</span>${r.score ? `<strong>${r.score.value}<small>${r.score.unit}${r.score.fu ? ` · ${r.score.fu} fu` : ''}</small></strong>` : ''}</div>${r.winner !== null ? `<div class="result-hand">${r.hands[r.winner].map((t) => tileStatic(t)).join('')}</div><div class="score-patterns">${r.score!.patterns.map((p) => `<div><span>${esc(p.name)}</span><strong>+${p.value}</strong></div>`).join('')}</div>` : `<p class="dialog-intro">${g.rules.preset === 'riichi' ? `${r.tenpai?.map((i) => esc(g.players[i].profile.name)).join(', ') || 'No players'} in tenpai.` : 'The next hand is another chance.'}</p>`}<div class="result-scores">${g.players.map((p, i) => `<div>${avatarHTML(p.profile.name, p.profile.avatar, p.bot)}<span>${esc(p.profile.name)}</span><strong class="${r.deltas[i] >= 0 ? 'positive' : 'negative'}">${r.deltas[i] > 0 ? '+' : ''}${r.deltas[i].toLocaleString()}</strong>${g.rules.points ? `<small>${p.points.toLocaleString()} total</small>` : ''}</div>`).join('')}</div><p class="form-note">${g.phase === 'finished' ? 'Match complete. Totals include placement points where applicable.' : r.repeat ? 'The dealer keeps the seat for another hand.' : 'The winds turn. The next player becomes East.'}</p><button class="button primary full" data-do="${g.phase === 'finished' ? 'close' : 'ready'}">${g.phase === 'finished' ? 'Back to the table' : 'Ready for the next hand'} ${icon('arrow')}</button>`,
    true,
  );
}

function rulesPageHTML() {
  return `<section class="rules-page"><div class="section-heading"><div class="page-title"><span class="eyebrow">YOUR TABLE. YOUR TRADITIONS.</span><h1>Play by your rules.</h1><p>Start with a classic. Make it your own. Every setting shapes the game.</p></div><button class="button primary" data-edit="new">${icon('plus')} Create a ruleset</button></div><h2>The classics</h2><div class="saved-rules-grid">${Object.values(
    PRESETS,
  )
    .map((r) => ruleCard(r, true))
    .join(
      '',
    )}</div><div class="section-heading"><h2>Your house rules</h2><span class="soft-label">Saved with your profile</span></div><div class="saved-rules-grid">${state?.rulesets.length ? state.rulesets.map((r) => ruleCard(r, false)).join('') : `<div class="rules-empty">${icon('settings')}<h3>Your own spin on a classic.</h3><p>Adjust timings, scoring, and custom bonuses.<br>Save a ruleset to use at any table.</p><button class="text-button" data-edit="new">Make your first ruleset ${icon('arrow')}</button></div>`}</div></section>`;
}
function ruleCard(r: Rules, base: boolean) {
  return `<article class="saved-rule"><span class="eyebrow">${base ? 'PRESET' : esc(PRESET_DETAILS[r.preset].region) + ' · HOUSE RULES'}</span><h3>${esc(r.name)}</h3><p>${base ? PRESET_DETAILS[r.preset].source : `${r.minimum} minimum · ${r.claimSeconds}s claims · ${r.houseBonuses.length} custom bonuses`}</p><div><button class="text-button" data-edit="${esc(r.id)}">${base ? 'Customize' : 'Edit rules'} ${icon('settings')}</button><button class="circle-arrow" data-preset="${esc(r.id)}" aria-label="Play ${esc(r.name)}">${icon('arrow')}</button></div></article>`;
}
let editing: Rules | null = null;
const numberField = (key: keyof Rules, label: string, min: number, max: number, step = 1) =>
  `<label>${label}<input name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${editing![key]}" required/></label>`;
const toggle = (key: keyof Rules, label: string, help: string) =>
  `<label class="check-row compact"><input type="checkbox" name="${key}" ${editing![key] ? 'checked' : ''}/><span><strong>${label}</strong><small>${help}</small></span></label>`;
function showEditor(id: string) {
  editing = structuredClone(
    id === 'new'
      ? PRESETS.singapore
      : (state?.rulesets.find((r) => r.id === id) ?? PRESETS[id as Preset]),
  );
  if (id in PRESETS || id === 'new') {
    editing.id = requestId();
    editing.name = `My ${editing.name}`;
  }
  renderEditor();
}
function renderEditor() {
  const r = editing!;
  openDialog(
    'editor',
    'Your table, your way.',
    `<form id="rules-form"><div class="form-grid"><label>RULESET NAME<input name="name" maxlength="40" value="${esc(r.name)}" required/></label><label>BASED ON<select id="editor-preset" name="preset">${Object.values(
      PRESETS,
    )
      .map(
        (p) =>
          `<option value="${p.preset}" ${r.preset === p.preset ? 'selected' : ''}>${p.name}</option>`,
      )
      .join(
        '',
      )}</select></label></div><fieldset><legend>The pace of play</legend><div class="form-grid three">${numberField('rounds', 'WINDS / ROUNDS', 1, 4)}${numberField('claimSeconds', 'CLAIM WINDOW (SECONDS)', 3, 30)}${numberField('turnSeconds', 'TURN CLOCK (SECONDS)', 10, 120)}</div><label>MELD CALL PRIORITY<select name="meldPriority"><option value="pung-first" ${r.meldPriority === 'pung-first' ? 'selected' : ''}>Pung & kong, then chow</option><option value="equal" ${r.meldPriority === 'equal' ? 'selected' : ''}>Equal · earliest valid click</option><option value="chow-first" ${r.meldPriority === 'chow-first' ? 'selected' : ''}>Chow, then pung & kong</option></select><small>Wins always come first. Earliest server-received click breaks ties.</small></label>${toggle('allowChow', 'Allow chows / chis', 'Sequences can be called from the preceding player.')}${toggle('allowKong', 'Allow kongs / kans', 'Four of a kind can be declared for a replacement tile.')}${toggle('sevenPairs', 'Allow seven pairs', 'Enable the seven-pair winning shape.')}${r.preset !== 'mcr' ? toggle('dealerRepeats', 'Dealer continuations', r.preset === 'singapore' ? 'Repeat a drawn hand if there were no kongs.' : 'Repeat after a dealer win or dealer tenpai draw.') : ''}</fieldset><fieldset><legend>Scoring & play points</legend><div class="form-grid">${numberField('minimum', `MINIMUM ${r.preset === 'riichi' ? 'HAN' : r.preset === 'singapore' ? 'TAI' : 'FAN'}`, r.preset === 'riichi' ? 1 : 0, r.preset === 'riichi' ? 13 : r.preset === 'singapore' ? 12 : 88)}${numberField('scoreMultiplier', 'POINT MULTIPLIER', 1, 10)}${numberField('startingPoints', 'STARTING POINTS', 0, 100000)}</div>${toggle('points', 'Track point totals', 'Keep a cumulative point balance across hands. Winning thresholds still apply when off.')}${r.preset === 'riichi' ? `${toggle('openTanyao', 'Open all simples', 'Allow tanyao in an open hand.')}${toggle('kiriage', 'Round up to mangan', '4 han / 30 fu and 3 han / 60 fu become mangan (EMA 2025).')}${toggle('uraDora', 'Ura dora', 'Reveal extra indicators for a winning riichi hand.')}` : ''}${r.preset === 'singapore' ? `<div class="form-grid">${numberField('taiCap', 'TAI CAP', 1, 12)}${numberField('sgBase', 'BASE POINT UNIT', 1, 100)}${numberField('sgSelfDraw', 'SELF-DRAW PAYMENT FACTOR', 1, 4)}${numberField('sgBonusUnit', 'INSTANT BONUS UNIT', 1, 100)}</div>${toggle('sgAnimals', 'Include animal tiles', 'Cat, rat, rooster, and centipede. Each adds tai.')}${toggle('sgFlowers', 'Include flowers & seasons', 'Eight bonus tiles, seat flowers, and flower wins.')}${toggle('sgInstantBonuses', 'Immediate bonus payments', 'Animal pairs, own flower pairs, full bonus sets, and open/added kongs.')}` : ''}</fieldset><fieldset><legend>Fake chips</legend>${toggle('chips', 'Play with fake chips', 'A separate ledger for fun, with no monetary value.')}<div class="form-grid">${numberField('startingChips', 'STARTING CHIPS', 0, 1000000)}${numberField('chipsPerPoint', 'FAKE CHIPS PER POINT', 0.001, 1000, 0.001)}</div></fieldset><fieldset><legend>Custom house bonuses</legend><p class="field-help">Add an executable scoring condition. ${r.preset === 'riichi' ? 'Bonuses are flat points after official han/fu scoring; they cannot create a yaku.' : `Bonuses add ${r.preset === 'mcr' ? 'fan' : 'tai'} and count toward the minimum.`}</p><div id="bonus-editor">${r.houseBonuses.map((b, i) => bonusRow(b, i)).join('')}</div><button type="button" class="text-button" data-do="add-bonus">${icon('plus')} Add a bonus</button></fieldset><div class="form-note">${icon('book')} Saving makes a house ruleset. Existing tables keep the rules they started with.</div><button class="button primary full">Save ruleset ${icon('check')}</button></form>`,
    true,
  );
}
function bonusRow(b: Rules['houseBonuses'][0], i: number) {
  return `<div class="bonus-row"><input name="bonusName${i}" placeholder="Bonus name" aria-label="Bonus name" value="${esc(b.name)}" maxlength="30" required/><select name="bonusCondition${i}" aria-label="Bonus condition">${['self-draw', 'closed', 'all-pungs', 'full-flush'].map((c) => `<option value="${c}" ${b.condition === c ? 'selected' : ''}>${c.replaceAll('-', ' ')}</option>`).join('')}</select><input name="bonusPoints${i}" type="number" min="1" max="100" value="${b.points}" aria-label="Bonus amount" required/><button type="button" class="icon-button" data-remove-bonus="${i}" aria-label="Remove bonus">${icon('close')}</button></div>`;
}
function readRulesForm() {
  const form = document.querySelector<HTMLFormElement>('#rules-form');
  if (!form || !editing) return;
  const d = new FormData(form);
  for (const [key, value] of Object.entries(editing)) {
    if (key === 'houseBonuses' || key === 'id') continue;
    if (form.elements.namedItem(key)) {
      if (typeof value === 'boolean')
        (editing as unknown as Record<string, unknown>)[key] = d.has(key);
      else if (typeof value === 'number')
        (editing as unknown as Record<string, unknown>)[key] = Number(d.get(key));
      else (editing as unknown as Record<string, unknown>)[key] = String(d.get(key));
    }
  }
  editing.houseBonuses = editing.houseBonuses.map((_, i) => ({
    name: String(d.get(`bonusName${i}`)),
    condition: String(d.get(`bonusCondition${i}`)) as Rules['houseBonuses'][0]['condition'],
    points: Number(d.get(`bonusPoints${i}`)),
  }));
}
async function copyInvite(lobby = false) {
  if (!state) return;
  const code = lobby ? state.lobby.code : state.room?.code;
  if (!code) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set(lobby ? 'lobby' : 'room', code);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast(`${lobby ? 'Lobby' : 'Table'} invitation copied · ${code}`);
  } catch {
    openDialog(
      'invite',
      'Pull up a chair.',
      `<p class="dialog-intro">Share this link, or give your friends the code <strong>${code}</strong>.</p><input class="invite-input" aria-label="Invitation link" value="${esc(url)}" readonly/>`,
    );
  }
}

app.addEventListener('click', async (e) => {
  const button = (e.target as Element).closest<HTMLElement>('button, [data-do]');
  if (!button || button.hasAttribute('disabled')) return;
  try {
    if (button.dataset.page) {
      if (state?.room) {
        showHelp();
        return;
      }
      page = button.dataset.page as typeof page;
      mounted = '';
      render();
      return;
    }
    if (button.dataset.preset) {
      showCreate(button.dataset.preset);
      return;
    }
    if (button.dataset.edit) {
      showEditor(button.dataset.edit);
      return;
    }
    if (button.dataset.join) {
      await command('join', button.dataset.join);
      return;
    }
    if (button.dataset.lobby) {
      await command('join-lobby', button.dataset.lobby);
      closeDialog();
      return;
    }
    if (button.dataset.tile) {
      if (rack?.suppressClick() || button.dataset.canDiscard !== 'true') return;
      selected = Number(button.dataset.tile);
      renderGame(state!.room!.game!);
      return;
    }
    if (button.dataset.action) {
      const g = state!.room!.game!;
      button.setAttribute('disabled', '');
      try {
        await command('action', { decision: g.decision, action: button.dataset.action });
      } finally {
        button.removeAttribute('disabled');
      }
      selected = null;
      riichiMode = false;
      return;
    }
    if (button.dataset.removeBonus !== undefined) {
      readRulesForm();
      editing!.houseBonuses.splice(Number(button.dataset.removeBonus), 1);
      renderEditor();
      return;
    }
    switch (button.dataset.do) {
      case 'sort':
        rack?.sort();
        break;
      case 'win-check':
        showWinCheck();
        break;
      case 'discards':
        toggleDiscards();
        break;
      case 'close-discards':
        closeDiscards();
        break;
      case 'log': {
        const drawer = document.querySelector<HTMLElement>('#game-drawer')!;
        drawer.hidden = !drawer.hidden;
        document
          .querySelector('[aria-label="Game log"]')
          ?.setAttribute('aria-expanded', String(!drawer.hidden));
        break;
      }
      case 'fullscreen':
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen?.();
        break;
      case 'home':
        if (!state?.room) {
          page = 'play';
          mounted = '';
          render();
        }
        break;
      case 'create':
        showCreate();
        break;
      case 'practice':
        showCreate('singapore', true);
        break;
      case 'join':
        showJoin();
        break;
      case 'profile':
        showProfile();
        break;
      case 'close':
        closeDialog();
        break;
      case 'lobbies':
        showLobbies();
        break;
      case 'create-lobby':
        showCreateLobby();
        break;
      case 'share-room':
        await copyInvite();
        break;
      case 'share-lobby':
        await copyInvite(true);
        break;
      case 'help':
        showHelp();
        break;
      case 'result':
        showResult(state!.room!.game!);
        break;
      case 'fill-bots':
        await command('fill-bots');
        break;
      case 'start':
        await command('start');
        break;
      case 'ready':
        closeDialog();
        await command('ready');
        break;
      case 'rematch':
        await command('rematch');
        break;
      case 'sound':
        sound = !sound;
        button.innerHTML = icon(sound ? 'sound' : 'mute');
        button.setAttribute('aria-label', sound ? 'Mute game sounds' : 'Enable game sounds');
        tone();
        break;
      case 'riichi':
        riichiMode = !riichiMode;
        selected = null;
        renderGame(state!.room!.game!);
        break;
      case 'discard':
        if (selected !== null) {
          const g = state!.room!.game!;
          button.setAttribute('disabled', '');
          try {
            await command('action', {
              decision: g.decision,
              action: `${riichiMode ? 'riichi' : 'discard'}:${selected}`,
            });
          } finally {
            button.removeAttribute('disabled');
          }
          selected = null;
          riichiMode = false;
        }
        break;
      case 'leave':
        openDialog(
          'leave',
          'Leave this table?',
          `<p class="dialog-intro">${state!.room!.game ? 'A bot will take your seat and finish the match for the table.' : 'Your seat will become available for someone else.'}</p><button class="button primary full" data-do="confirm-leave">Leave the table ${icon('arrow')}</button>`,
        );
        break;
      case 'confirm-leave':
        await command('leave');
        closeDialog();
        mounted = '';
        render();
        break;
      case 'add-bonus':
        readRulesForm();
        if (editing!.houseBonuses.length >= 8) {
          toast('A ruleset can have up to eight bonuses.');
          break;
        }
        editing!.houseBonuses.push({ name: 'House bonus', condition: 'self-draw', points: 1 });
        renderEditor();
        break;
    }
  } catch {
    /* Command errors are shown in the live toast region. */
  }
});
function showHelp() {
  openDialog('help', 'A little table wisdom.', helpBody(state?.room?.rules), true);
}
modal.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).id === 'editor-preset') {
    const p = (e.target as HTMLSelectElement).value as Preset;
    const id = editing!.id;
    editing = { ...structuredClone(PRESETS[p]), id, name: `My ${PRESETS[p].name}` };
    renderEditor();
  }
});
modal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit],button:not([type])');
  if (submit) submit.disabled = true;
  try {
    switch (form.id) {
      case 'create-form': {
        const id = String(data.get('rules')),
          rules = state?.rulesets.find((r) => r.id === id) ?? PRESETS[id as Preset];
        await command('create', { name: data.get('name'), rules, bots: data.has('bots') });
        break;
      }
      case 'join-form':
        await command('join', data.get('code'));
        break;
      case 'profile-form':
        await command('profile', { name: data.get('name'), avatar: data.get('avatar') });
        toast('Profile saved. Good to see you.');
        break;
      case 'lobby-form':
        await command('create-lobby', data.get('name'));
        toast('Your lobby is ready. Open a table and invite friends.');
        break;
      case 'join-lobby-form':
        await command('join-lobby', data.get('code'));
        break;
      case 'rules-form':
        readRulesForm();
        await command('save-rules', editing);
        toast('Ruleset saved. Ready for your next table.');
        break;
    }
    closeDialog();
  } catch {
    if (submit) submit.disabled = false;
  }
});
render();
