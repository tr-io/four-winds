import type { AppState, GameEvent, HandRecord } from '../shared/types';
import { REACTIONS } from '../shared/avatars';
import { tileName } from '../shared/tiles';
import { tileStatic } from './tile-art';
import { readPreferences, savePreferences, type LocalPreferences } from './local-preferences';
import { Ambience } from './ambience';
import type { MahjongTable } from './table';
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function eventLogHTML(events: GameEvent[], players: string[]) {
  return `<ol class="full-event-log">${events.map((e) => `<li><time>${new Date(e.at).toLocaleTimeString()}</time><div>${esc(e.text)}${e.payments ? `<div class="event-payments">${e.payments.map((n, i) => `<span>${esc(players[i])} <b>${n >= 0 ? '+' : ''}${n}</b></span>`).join('')}</div>` : ''}</div>${e.tile !== undefined ? tileStatic(e.tile, 'tiny') : ''}</li>`).join('')}</ol>`;
}
export class SocialUI {
  private state?: AppState;
  private player = '';
  private preferences!: LocalPreferences;
  private ambient = new Ambience();
  private queue: number[] = [];
  private queueMode = false;
  private handKey = '';
  private sent = '';
  private pending = false;
  private notified = '';
  private chatScope: 'table' | 'lobby' = 'table';
  private roomCode = '';
  private chatOpen = false;
  private seenReaction = '';
  private reactionContext = '';
  constructor(
    private command: (type: string, data?: unknown) => Promise<Record<string, unknown>>,
    private dialog: (id: string, title: string, body: string, wide?: boolean) => void,
    private getTable: () => MahjongTable | null,
    private toast: (s: string, error?: boolean) => void,
  ) {
    document.addEventListener('click', this.click);
    document.addEventListener('submit', this.submit);
    document.addEventListener('change', this.change);
  }
  update(state: AppState) {
    this.state = state;
    if (this.player !== state.profile.id) {
      this.player = state.profile.id;
      this.preferences = readPreferences(this.player);
      this.notified = '';
    }
    if (this.roomCode !== (state.room?.code ?? '')) {
      this.roomCode = state.room?.code ?? '';
      this.chatScope = state.room ? 'table' : 'lobby';
      this.chatOpen = false;
    }
    this.applyPreferences();
    this.renderChat();
    const g = state.room?.game;
    const key = `${state.room?.code}:${g?.handNumber}:${g?.events[0]?.at}`;
    if (key !== this.handKey) {
      this.handKey = key;
      this.queue = [];
      this.queueMode = false;
      this.sent = '';
    }
    if (g) {
      this.queue = this.queue.filter((t) => g.players[g.seat].hand.includes(t));
      if (g.result) this.queue = [];
      this.processQueue();
      this.notifyTurn();
    }
    this.renderQueue();
    this.renderReactions();
  }
  disconnected() {
    this.queue = [];
    this.queueMode = false;
    this.renderQueue();
  }
  private applyPreferences() {
    document.body.dataset.environment = this.preferences.environment;
    this.getTable()?.setViewControls(this.preferences.rotate, this.preferences.zoom);
    document
      .querySelectorAll<HTMLButtonElement>('[data-social="zoom-in"], [data-social="zoom-out"]')
      .forEach((button) => {
        button.disabled = !this.preferences.zoom;
      });
    this.ambient.configure(
      !!this.state?.room && this.preferences.ambient,
      this.preferences.environment,
      this.preferences.volume,
    );
  }
  settingsHTML() {
    const p = this.preferences;
    return `<section class="personal-settings"><h3>A little room to breathe.</h3><label>Surroundings<select data-preference="environment"><option value="garden" ${p.environment === 'garden' ? 'selected' : ''}>Bamboo garden · birds</option><option value="rain" ${p.environment === 'rain' ? 'selected' : ''}>Rain pavilion · rainfall</option><option value="pond" ${p.environment === 'pond' ? 'selected' : ''}>Lotus pond · water</option></select></label><label><input type="checkbox" data-preference="ambient" ${p.ambient ? 'checked' : ''}/> Ambient sound</label><label>Ambient volume<input type="range" min="0" max="100" value="${p.volume * 100}" data-preference="volume"/></label><label><input type="checkbox" data-preference="rotate" ${p.rotate ? 'checked' : ''}/> Drag to rotate the board · right-drag to pan</label><label><input type="checkbox" data-preference="zoom" ${p.zoom ? 'checked' : ''}/> Scroll or pinch to zoom the board</label><div class="board-view-buttons"><button type="button" class="text-button" data-social="zoom-in" ${p.zoom ? '' : 'disabled'}>Zoom in</button><button type="button" class="text-button" data-social="zoom-out" ${p.zoom ? '' : 'disabled'}>Zoom out</button><button type="button" class="text-button" data-social="reset-view">Reset board view</button></div><label><input type="checkbox" data-preference="notifications" ${p.notifications ? 'checked' : ''}/> Browser turn notifications</label><small>Notifications arrive while this tab is hidden. Preferences stay in this browser.</small></section>`;
  }
  private change = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.preference;
    if (!key || !this.state) return;
    if (key === 'notifications' && input.checked) {
      if (!('Notification' in window)) {
        input.checked = false;
        this.toast('This browser does not support turn notifications.', true);
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          input.checked = false;
          this.toast(
            'Notifications are blocked. Enable them in your browser’s site settings.',
            true,
          );
          return;
        }
      } catch {
        input.checked = false;
        this.toast('Notifications are unavailable in this browser.', true);
        return;
      }
    }
    if (key === 'volume') this.preferences.volume = Number(input.value) / 100;
    else if (key === 'environment' && ['garden', 'rain', 'pond'].includes(input.value))
      this.preferences.environment = input.value as LocalPreferences['environment'];
    else if (key === 'rotate' || key === 'zoom' || key === 'ambient' || key === 'notifications')
      this.preferences[key] = input.checked;
    savePreferences(this.player, this.preferences);
    this.applyPreferences();
  };
  selectTile(tile: number) {
    if (!this.queueMode) return false;
    const g = this.state?.room?.game;
    if (!g || g.result) return false;
    if (this.queue.includes(tile)) this.queue = this.queue.filter((t) => t !== tile);
    else this.queue.push(tile);
    this.renderQueue();
    return true;
  }
  private renderQueue() {
    const root = document.querySelector('#discard-queue');
    if (!root) return;
    root.innerHTML = `<button class="text-button" data-social="queue-mode" aria-pressed="${this.queueMode}">${this.queueMode ? '✓ Selecting discards' : 'Queue discards'}</button>${this.queue.length ? `<span>Next: ${this.queue.map((t, i) => `<button class="queued-tile" data-unqueue="${t}" aria-label="Remove ${esc(tileName(t))} from queue">${i + 1}. ${tileStatic(t, 'tiny')}</button>`).join('')}</span><button class="text-button" data-social="clear-queue">Clear</button>` : ''}${this.queueMode ? '<small>Choose tiles in discard order. They auto-discard on your turn; win and kong choices pause the queue.</small>' : ''}`;
    document.querySelectorAll<HTMLElement>('.hand-tiles [data-tile]').forEach((el) => {
      const index = this.queue.indexOf(Number(el.dataset.tile));
      el.classList.toggle('is-queued', index >= 0);
      if (index >= 0) el.dataset.queueOrder = String(index + 1);
      else delete el.dataset.queueOrder;
    });
  }
  private processQueue() {
    const g = this.state?.room?.game;
    if (
      !g ||
      this.queueMode ||
      this.pending ||
      !this.queue.length ||
      g.turn !== g.seat ||
      g.phase !== 'playing' ||
      g.actions.some(
        (a) => a.kind === 'win' || a.kind === 'concealed-kong' || a.kind === 'added-kong',
      )
    )
      return;
    const action = g.actions.find((a) => a.kind === 'discard' && a.tiles[0] === this.queue[0]);
    const id = `${this.handKey}:${g.decision}`;
    if (!action || this.sent === id) return;
    this.sent = id;
    this.queue.shift();
    this.pending = true;
    void this.command('action', { decision: g.decision, action: action.id })
      .catch(() => {
        this.queue = [];
      })
      .finally(() => {
        this.pending = false;
        this.renderQueue();
      });
  }
  private notifyTurn() {
    const g = this.state?.room?.game;
    if (
      !g ||
      !this.preferences.notifications ||
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    )
      return;
    const yourTurn = g.phase === 'playing' && g.turn === g.seat;
    const claim = g.phase === 'claim' && g.actions.some((a) => a.kind !== 'pass');
    if (!yourTurn && !claim) return;
    const key = `${this.handKey}:${g.decision}`;
    if (key === this.notified) return;
    this.notified = key;
    if (!document.hidden) return;
    try {
      const n = new Notification(
        yourTurn ? 'Four Winds · Your turn' : 'Four Winds · A tile you can call',
        {
          body: yourTurn
            ? 'Your tile is ready. Choose a discard.'
            : 'Return to the table before the claim window closes.',
          tag: 'four-winds-turn',
        },
      );
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 12000);
    } catch {
      /* Some mobile browsers require a service worker. */
    }
  }
  private renderChat() {
    let panel = document.querySelector<HTMLElement>('#social-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'social-panel';
      panel.className = 'social-panel';
      panel.setAttribute('aria-label', 'Session chat');
      document.querySelector('.game-window')?.append(panel);
      if (!panel.isConnected) document.querySelector('#content')?.append(panel);
      panel.innerHTML = `<header><strong>At the table</strong><button class="icon-button" data-social="chat" aria-label="Close chat">×</button></header><nav aria-label="Chat channel"><button data-chat-scope="table">Table</button><button data-chat-scope="lobby">Session</button></nav><div id="chat-messages" role="log" aria-live="polite" aria-relevant="additions text"></div><form id="chat-form"><label class="sr-only" for="chat-message">Message</label><input id="chat-message" name="message" maxlength="300" placeholder="Say hello…" autocomplete="off" required/><button class="button primary" aria-label="Send message">Send</button></form><div class="reaction-buttons">${REACTIONS.map((r) => `<button data-reaction="${r}" aria-label="React ${r}">${r}</button>`).join('')}</div><small>Last 100 messages · ${this.state?.room ? 'table & lobby session' : 'lobby session'}</small>`;
    }
    panel.hidden = !this.chatOpen;
    if (!this.state?.room) this.chatScope = 'lobby';
    panel.querySelectorAll<HTMLButtonElement>('[data-chat-scope]').forEach((b) => {
      b.disabled = b.dataset.chatScope === 'table' && !this.state?.room;
      b.setAttribute('aria-pressed', String(b.dataset.chatScope === this.chatScope));
    });
    const messages = this.chatScope === 'table' ? this.state?.room?.chat : this.state?.chat;
    const root = panel.querySelector('#chat-messages')!;
    const signature = JSON.stringify(messages);
    if (root.getAttribute('data-signature') !== signature) {
      root.setAttribute('data-signature', signature);
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 30;
      root.innerHTML =
        (messages ?? [])
          .map(
            (m) =>
              `<article class="${m.reaction ? 'chat-reaction' : ''}"><strong>${esc(m.name)}</strong><time>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><p>${esc(m.text)}</p></article>`,
          )
          .join('') || '<p class="chat-empty">A quiet corner. Say hello.</p>';
      if (atBottom) root.scrollTop = root.scrollHeight;
    }
  }
  private renderReactions() {
    const context = this.state?.room?.code ?? '';
    const message = this.state?.room?.chat?.filter((m) => m.reaction).at(-1);
    if (context !== this.reactionContext) {
      this.reactionContext = context;
      this.seenReaction = message?.id ?? '';
      return;
    }
    if (!message || message.id === this.seenReaction) return;
    this.seenReaction = message.id;
    if (Date.now() - message.at > 6000) return;
    const bubble = document.createElement('div');
    bubble.className = 'reaction-bubble';
    bubble.textContent = `${message.text} ${message.name}`;
    document.querySelector('.game-window')?.append(bubble);
    setTimeout(() => bubble.remove(), 3500);
  }
  showPlayer(seat: number) {
    const g = this.state?.room?.game,
      p = g?.players[seat];
    if (!p) return;
    this.dialog(
      'player-melds',
      esc(p.profile.name),
      `<p>${p.melds.length} declared sets · ${p.bonuses.length} bonus tiles · ${p.discards.length} discards</p><div class="player-meld-details">${p.melds.map((m) => `<section><h3>${m.concealed ? 'Concealed ' : ''}${m.kind}${m.added ? ' · added' : ''}</h3><div>${m.tiles.map((t, i) => (m.concealed && (i === 0 || i === m.tiles.length - 1) ? '<span class="tile-back" aria-label="Concealed tile"></span>' : tileStatic(t))).join('')}</div></section>`).join('') || '<p>No declared melds yet.</p>'}${p.bonuses.length ? `<section><h3>${g.rules.preset === 'singapore' ? 'Flowers & animals' : 'Flowers & seasons'}</h3><div>${p.bonuses.map((t) => tileStatic(t)).join('')}</div></section>` : ''}</div><section class="player-discards" aria-label="Player discards"><h3>Discards</h3>${p.discards.length ? `<p class="form-note">In play order. Called tiles have moved into another player's meld.</p><ol>${p.discards.map((d, i) => `<li><span aria-label="Discard ${i + 1}">${i + 1}</span>${tileStatic(d.tile)}${d.claimed || d.riichi ? `<small>${[d.claimed ? 'Called' : '', d.riichi ? 'Riichi' : ''].filter(Boolean).join(' · ')}</small>` : ''}</li>`).join('')}</ol>` : '<p>No discards yet.</p>'}</section><p class="form-note">Only public tiles are shown. Concealed hands stay private.</p>`,
      true,
    );
  }
  showHistory() {
    const history = this.state?.history ?? [];
    this.dialog(
      'history',
      'Your hand history',
      `<p>Saved with your profile · latest 100 completed hands</p><div class="history-list">${history.map((r) => `<button data-history="${r.id}"><strong>${esc(r.table)} · Hand ${r.handNumber}</strong><small>${esc(r.preset)} · ${new Date(r.at).toLocaleString()}</small><span>View events →</span></button>`).join('') || '<p>Your completed hands will appear here.</p>'}</div>`,
      true,
    );
  }
  showSaved() {
    this.dialog(
      'saved-tables',
      'Your saved tables',
      `<div class="history-list">${(this.state?.savedTables ?? []).map((r) => `<div><strong>${esc(r.name)}</strong><small>${r.code}</small><button class="button primary" data-join="${r.code}" ${r.available ? '' : 'disabled'}>Resume</button><button class="text-button" data-forget="${r.code}">Remove bookmark</button></div>`).join('') || '<p>Choose “Save and leave” when leaving a table to keep it here.</p>'}</div>`,
    );
  }
  private click = async (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b || b.hasAttribute('disabled')) return;
    try {
      if (b.dataset.inspectSeat !== undefined) {
        this.showPlayer(Number(b.dataset.inspectSeat));
        return;
      }
      if (b.dataset.unqueue !== undefined) {
        this.queue = this.queue.filter((t) => t !== Number(b.dataset.unqueue));
        this.renderQueue();
        return;
      }
      if (b.dataset.chatScope) {
        this.chatScope = b.dataset.chatScope as 'table' | 'lobby';
        this.renderChat();
        return;
      }
      if (b.dataset.reaction) {
        await this.command('chat', {
          scope: this.chatScope,
          text: b.dataset.reaction,
          reaction: true,
        });
        return;
      }
      if (b.dataset.history) {
        const { record } = await this.command('history-detail', b.dataset.history);
        const r = record as HandRecord;
        this.dialog(
          'history-detail',
          `${esc(r.table)} · Hand ${r.handNumber}`,
          `<p>${esc(r.result.reason)}</p>${eventLogHTML(r.events, r.players)}`,
          true,
        );
        return;
      }
      if (b.dataset.forget) {
        await this.command('forget-table', b.dataset.forget);
        this.showSaved();
        return;
      }
      switch (b.dataset.social) {
        case 'chat':
          this.chatOpen = !this.chatOpen;
          this.renderChat();
          if (this.chatOpen) document.querySelector<HTMLInputElement>('#chat-message')?.focus();
          break;
        case 'queue-mode':
          this.queueMode = !this.queueMode;
          if (!this.queueMode && this.queue.length)
            this.toast('Discard queue armed. It pauses for wins and kongs.');
          this.renderQueue();
          this.processQueue();
          break;
        case 'clear-queue':
          this.queue = [];
          this.renderQueue();
          break;
        case 'zoom-in':
          this.getTable()?.zoomBy(0.85);
          break;
        case 'zoom-out':
          this.getTable()?.zoomBy(1 / 0.85);
          break;
        case 'reset-view':
          this.getTable()?.resetView();
          break;
        case 'history':
          this.showHistory();
          break;
        case 'saved':
          this.showSaved();
          break;
        case 'bloom': {
          const scene = b.closest('.zen-garden');
          scene?.classList.remove('blooming');
          requestAnimationFrame(() => scene?.classList.add('blooming'));
          setTimeout(() => scene?.classList.remove('blooming'), 1600);
          this.toast(
            this.preferences.environment === 'rain'
              ? 'Raindrops fall from the leaves.'
              : 'The lotus opens to the light.',
          );
          break;
        }
      }
    } catch {
      /* Commands report errors in the shared toast. */
    }
  };
  private submit = async (e: Event) => {
    const form = e.target as HTMLFormElement;
    if (form.id !== 'chat-form') return;
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input')!,
      value = input.value.trim();
    if (!value) return;
    try {
      await this.command('chat', { scope: this.chatScope, text: value });
      if (input.value.trim() === value) input.value = '';
    } catch {
      /* Keep draft on failure. */
    }
  };
}
export const gardenHTML =
  '<div class="zen-garden"><button data-social="bloom" class="lotus" aria-label="Touch the lotus to make it bloom"><i></i><i></i><i></i><i></i><i></i><span>✦</span></button><div class="rain-drops" aria-hidden="true"><i></i><i></i><i></i></div><div class="water-rings" aria-hidden="true"><i></i><i></i><i></i></div></div>';
