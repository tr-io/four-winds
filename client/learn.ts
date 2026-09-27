import { LESSONS, LESSON_HANDS, type LessonCheck, type LessonClaims } from '../shared/lessons';
import type { Preset } from '../shared/types';
import { tileName, kind } from '../shared/tiles';
import { tileHTML, tileStatic } from './tile-art';
import './learn.css';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const titles = ['Draw', 'Choose', 'Discard', 'Claim or pass'];
export class LearnPage {
  private preset: Preset = 'mcr';
  private step = 0;
  private claimStep = 0;
  private groups: number[][] = [[], [], [], [], []];
  private target = 0;
  private claims?: LessonClaims;
  private version = 0;
  private disposed = false;
  constructor(
    private host: HTMLElement,
    private command: (type: string, data?: unknown) => Promise<Record<string, unknown>>,
  ) {
    this.host.addEventListener('click', this.click);
    this.host.addEventListener('focusin', this.focus);
    this.render();
    void this.loadClaims();
  }
  private tile(t: number, attrs = '') {
    return tileHTML(t, 'lesson-tile', `data-learn-tile="${t}" ${attrs}`);
  }
  private render() {
    const l = LESSONS[this.preset];
    this.host.innerHTML = `<section class="learn-experience"><header class="learn-hero"><div><span class="eyebrow">A MAHJONG FIELD GUIDE</span><h1>Same tiles.<br><em>Different traditions.</em></h1><p>Learn a turn. Build a hand. Find your next move.</p></div><div class="learn-hero-tiles" aria-hidden="true">${[76, 132, 56].map((t) => tileStatic(t)).join('')}</div></header>
      <nav class="lesson-presets" aria-label="Lesson ruleset">${Object.entries(LESSONS)
        .map(
          ([p, info]) =>
            `<button data-lesson-preset="${p}" aria-pressed="${p === this.preset}"><span aria-hidden="true">${p === 'mcr' ? '中' : p === 'riichi' ? '立' : '花'}</span><strong>${info.title}<small>${info.subtitle}</small></strong>${p === this.preset ? '<b aria-hidden="true">✓</b>' : ''}</button>`,
        )
        .join('')}</nav>
      <p class="lesson-context">${l.title} preset · ${l.tiles} tiles · ${l.minimum}</p>
      <section class="lesson-panel"><header><span class="lesson-number">1</span><div><h2>Meet the tiles.</h2><p>Select any tile to learn its name and role.</p></div></header><div class="tile-families">${[
        [18, 'Bamboo'],
        [9, 'Circles'],
        [0, 'Characters'],
      ]
        .map(
          ([base, name]) =>
            `<div class="tile-family"><h3>${name} <small>1–9</small></h3><div>${Array.from({ length: 9 }, (_, i) => this.tile((Number(base) + i) * 4)).join('')}</div></div>`,
        )
        .join(
          '',
        )}<div class="tile-family"><h3>Winds</h3><div>${[108, 112, 116, 120].map((t) => this.tile(t)).join('')}</div></div><div class="tile-family"><h3>Dragons</h3><div>${[132, 128, 124].map((t) => this.tile(t)).join('')}</div></div><div class="tile-family bonus-family"><h3>${this.preset === 'riichi' ? 'The dead wall' : this.preset === 'mcr' ? 'Flowers & seasons' : 'Flowers, seasons & animals'}</h3>${this.preset === 'riichi' ? '<div class="mini-wall" aria-label="Fourteen reserved tiles">' + Array.from({ length: 7 }, () => '<i></i>').join('') + '</div>' : `<div>${Array.from({ length: this.preset === 'mcr' ? 8 : 12 }, (_, i) => this.tile(136 + i)).join('')}</div>`}</div></div><p id="tile-explanation" class="lesson-feedback" role="status">Suited tiles make sequences or matching sets. Winds and dragons make matching sets.</p><details><summary>Tile sets & bonus tiles</summary><p>${l.bonus}</p></details></section>
      <section class="lesson-panel"><header><span class="lesson-number">2</span><div><h2>A turn at the table.</h2><p>Follow the tile from the wall to the next decision.</p></div></header><div id="turn-lesson"></div><div class="lesson-controls"><button class="button outline" data-learn="back">← Back</button><span id="turn-progress"></span><button class="button primary" data-learn="next">Next →</button><button class="text-button" data-learn="replay">Replay</button></div><details><summary>What changes after a call?</summary><p>After ${l.chow.toLowerCase()} or ${l.pung.toLowerCase()}, discard without drawing. A ${l.kong.toLowerCase()} needs a replacement tile before your discard. Only the next player may ${l.chow.toLowerCase()}.</p></details></section>
      <section class="lesson-panel"><header><span class="lesson-number">3</span><div><h2>Build a hand.</h2><p>Choose a group, then select tiles to fill it. Select a grouped tile to return it.</p></div></header><div class="build-context"><strong>Closed hand · East seat · East round · self-draw</strong><span>Four sets of three + one pair = 14 tiles</span></div><div id="hand-builder"></div><div class="lesson-controls"><button class="button primary" data-learn="check">Check my hand</button><button class="button outline" data-learn="hint">Show an example</button><button class="text-button" data-learn="reset">Start again</button></div><div id="build-result" class="lesson-feedback" role="status">Fill all five groups, then check both shape and ${this.preset === 'riichi' ? 'yaku' : this.preset === 'mcr' ? 'fan' : 'tai'}.</div><details><summary>A complete shape and a legal win</summary><p>${l.scoring}</p><p>${l.special}</p><p>The groups here remain concealed. They are an arrangement exercise, not exposed calls. The engine evaluates the tiles using the context above.</p></details></section>
      <section class="lesson-panel"><header><span class="lesson-number">4</span><div><h2>Who gets the discard?</h2><p>${l.claim}</p></div></header><div id="claim-lesson" aria-live="polite"></div><div class="lesson-controls"><button class="button outline" data-learn="claim-back">← Back</button><button class="button primary" data-learn="claim-next">Next response →</button><button class="text-button" data-learn="claim-replay">Replay claims</button></div><details><summary>Priority, timing & edge cases</summary><p>Four Winds resolves configured priority first, then earliest valid server receipt at equal priority. One player wins the discard. This online adaptation differs from rulebook seat-order ties and multiple ron.</p><p>${l.scoring}</p><p>In a real game, only currently legal actions appear. Passing a win can affect later claims, especially Riichi furiten and Singapore missed-win restrictions.</p></details></section>
      <footer class="lesson-footer"><div><h2>Let the winds gather.</h2><p>Ready to try ${l.title}?</p></div><button class="button primary" data-preset="${this.preset}">Play this tradition →</button><a href="${l.source}" target="_blank" rel="noreferrer">Rules source ↗</a></footer></section>`;
    this.renderTurn();
    this.renderBuilder();
    this.renderClaims();
  }
  private motion(selector: string, html: string) {
    const root = this.host.querySelector<HTMLElement>(selector)!;
    const before = new Map(
      [...root.querySelectorAll<HTMLElement>('[data-motion]')].map((el) => [
        el.dataset.motion,
        el.getBoundingClientRect(),
      ]),
    );
    root.innerHTML = html;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of root.querySelectorAll<HTMLElement>('[data-motion]')) {
      const old = before.get(el.dataset.motion),
        next = el.getBoundingClientRect();
      if (old)
        el.animate(
          [
            { transform: `translate(${old.x - next.x}px, ${old.y - next.y}px)`, opacity: 0.7 },
            { transform: 'translate(0,0)', opacity: 1 },
          ],
          { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
    }
  }
  private renderTurn() {
    const l = LESSONS[this.preset];
    const captions = [
      `Draw the next tile from the live wall. ${this.preset === 'riichi' ? 'The dead wall is reserved for kan replacements and indicators.' : 'Bonus tiles are exposed and replaced from the back.'}`,
      `Choose what to keep. The highlighted 5 bamboo joins your matching pair to make a ${l.pung.toLowerCase()}.`,
      `Discard the isolated North wind face up. Your turn ends; the other players can respond.`,
      `A legal ${this.preset === 'riichi' ? 'ron' : l.win.toLowerCase()} can win this discard. Otherwise players may ${l.pung.toLowerCase()} or ${l.kong.toLowerCase()} North. Honor tiles cannot form a ${l.chow.toLowerCase()}.`,
    ];
    const moving = this.tile(88, 'data-motion="draw"');
    const north = this.tile(120, 'data-motion="discard"');
    this.motion(
      '#turn-lesson',
      `<div class="teaching-table"><div class="lesson-wall"><span>LIVE WALL</span><div class="mini-wall">${Array.from({ length: 12 }, () => '<i></i>').join('')}${this.step === 0 ? moving : ''}</div></div><div class="teaching-center"><span class="table-seal" aria-hidden="true">四 風</span><div class="lesson-discard"><small>DISCARD</small>${this.step >= 2 ? north : '<span class="tile-space"></span>'}${this.step === 3 ? '<b>North · matching sets only</b>' : ''}</div></div><div class="teaching-hand"><small>YOUR HAND · ${this.step === 1 ? 14 : 13} TILES</small><div>${[0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 89, 90].map((t) => tileStatic(t)).join('')}${this.step >= 1 ? moving : ''}${this.step < 2 ? north : ''}</div></div></div><div class="walk-caption" role="status"><span class="lesson-number">${this.step + 1}</span><div><h3>${titles[this.step]}</h3><p>${captions[this.step]}</p></div></div>`,
    );
    this.host.querySelector('#turn-progress')!.textContent = `${this.step + 1} / 4`;
    (this.host.querySelector('[data-learn="back"]') as HTMLButtonElement).disabled =
      this.step === 0;
    (this.host.querySelector('[data-learn="next"]') as HTMLButtonElement).disabled =
      this.step === 3;
  }
  private renderBuilder() {
    const sample = LESSON_HANDS[this.preset];
    const pool = [12, 0, 6, 3, 9, 1, 7, 13, 4, 10, 2, 8, 5, 11]
      .map((i) => sample[i])
      .filter((t) => !this.groups.flat().includes(t));
    this.motion(
      '#hand-builder',
      `<div class="build-groups">${this.groups
        .map(
          (tiles, i) =>
            `<section class="build-group ${this.target === i ? 'active' : ''}"><button class="group-target" data-group="${i}" aria-pressed="${this.target === i}">${i === 4 ? 'Pair' : `Set ${i + 1}`}${
              tiles.length === 3
                ? ` · ${
                    tiles.every((t) => kind(t) === kind(tiles[0]))
                      ? LESSONS[this.preset].pung
                      : tiles
                            .map(kind)
                            .sort((a, b) => a - b)
                            .every((k, j, all) => j === 0 || k === all[j - 1] + 1)
                        ? LESSONS[this.preset].chow
                        : 'check tiles'
                  }`
                : ''
            } <small>${tiles.length}/${i === 4 ? 2 : 3}</small></button><div>${tiles.map((t) => this.tile(t, `data-build="${t}" data-motion="build-${t}" aria-description="Return to available tiles"`)).join('')}${Array.from({ length: Math.max(0, (i === 4 ? 2 : 3) - tiles.length) }, () => '<span class="tile-space" aria-hidden="true">＋</span>').join('')}</div></section>`,
        )
        .join(
          '',
        )}</div><div class="build-pool"><strong>Available tiles</strong><div>${pool.map((t) => this.tile(t, `data-build="${t}" data-motion="build-${t}" aria-description="Add to ${this.target === 4 ? 'pair' : `set ${this.target + 1}`}"`)).join('') || '<span>All tiles placed. Check your hand.</span>'}</div></div>`,
    );
  }
  private async loadClaims() {
    const version = ++this.version;
    try {
      const result = await this.command('lesson-claims', this.preset);
      if (this.disposed || version !== this.version) return;
      this.claims = result.claims as LessonClaims;
      this.renderClaims();
    } catch {
      if (!this.disposed && version === this.version)
        this.host.querySelector('#claim-lesson')!.innerHTML =
          '<p>Could not load this example. <button class="text-button" data-learn="retry-claims">Retry</button></p>';
    }
  }
  private renderClaims() {
    const c = this.claims,
      l = LESSONS[this.preset];
    if (!c) {
      this.host.querySelector('#claim-lesson')!.textContent =
        'Checking this example with the game engine…';
      return;
    }
    const winner = this.claimStep === 2 ? c.winner : this.claimStep === 3 ? c.meldWinner : -1;
    const caption =
      this.claimStep === 0
        ? 'Sora discards 2 characters. You are next in turn order.'
        : this.claimStep === 1
          ? 'You call first, then Mei, then Jun. All three responses are legal for these tiles.'
          : this.claimStep === 2
            ? 'Jun’s legal win takes priority over both meld calls.'
            : c.explanation;
    this.motion(
      '#claim-lesson',
      `<div class="claim-demo"><div class="sample-discard"><small>SORA DISCARDS</small>${this.tile(c.discard, 'data-motion="claim-discard"')}<strong>2 characters</strong></div><div class="claim-responses">${c.responses.map((r) => `<article class="claim-example ${winner === r.seat ? 'claim-winner' : ''} ${this.claimStep === 0 ? 'unrevealed' : ''}"><h3>${r.name} · ${r.kind === 'chow' ? l.chow : r.kind === 'pung' ? l.pung : this.preset === 'riichi' ? 'Ron' : l.win}</h3><small>${r.seat + 1}. received · ${r.kind === 'win' ? 'winning hand' : 'legal meld'}</small><div>${r.tiles.map((t) => this.tile(t)).join('')}</div><strong>${winner === r.seat ? '✓ Wins the discard' : this.claimStep === 3 && r.kind === 'win' ? 'Passes this time' : this.claimStep >= 2 ? 'Waits' : 'Available response'}</strong></article>`).join('')}</div></div><p class="lesson-feedback" role="status">${caption}</p>`,
    );
    (this.host.querySelector('[data-learn="claim-back"]') as HTMLButtonElement).disabled =
      this.claimStep === 0;
    (this.host.querySelector('[data-learn="claim-next"]') as HTMLButtonElement).disabled =
      this.claimStep === 3;
  }
  private explain(tile: number) {
    const l = LESSONS[this.preset];
    const text =
      tile >= 136
        ? l.bonus
        : tile >= 108
          ? `Honor tile: make a matching ${l.pung.toLowerCase()}, ${l.kong.toLowerCase()}, or pair. Honors cannot form a sequence.`
          : `Suited tile: use matching tiles for a ${l.pung.toLowerCase()} or pair, or consecutive ranks in this suit for a ${l.chow.toLowerCase()}.`;
    this.host.querySelector('#tile-explanation')!.textContent = `${tileName(tile)}. ${text}`;
  }
  private focus = (event: Event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-learn-tile]');
    if (tile) this.explain(Number(tile.dataset.learnTile));
  };
  private click = async (event: Event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    if (b.dataset.lessonPreset) {
      this.preset = b.dataset.lessonPreset as Preset;
      this.step = this.claimStep = 0;
      this.groups = [[], [], [], [], []];
      this.claims = undefined;
      this.target = 0;
      this.render();
      this.host.querySelector<HTMLButtonElement>(`[data-lesson-preset="${this.preset}"]`)?.focus();
      void this.loadClaims();
      return;
    }
    if (b.dataset.learnTile) this.explain(Number(b.dataset.learnTile));
    if (b.dataset.group !== undefined) {
      this.target = Number(b.dataset.group);
      this.renderBuilder();
      this.host.querySelector<HTMLButtonElement>(`[data-group="${this.target}"]`)?.focus();
      return;
    }
    if (b.dataset.build !== undefined) {
      const tile = Number(b.dataset.build);
      const old = this.groups.find((g) => g.includes(tile));
      if (old) old.splice(old.indexOf(tile), 1);
      else if (this.groups[this.target].length < (this.target === 4 ? 2 : 3))
        this.groups[this.target].push(tile);
      else {
        this.host.querySelector('#build-result')!.textContent =
          'That group is full. Choose another group or return a tile.';
        return;
      }
      this.renderBuilder();
      this.host.querySelector<HTMLButtonElement>(`[data-build="${tile}"]`)?.focus();
      this.host.querySelector('#build-result')!.textContent =
        'Arrangement changed. Check your hand when ready.';
      return;
    }
    switch (b.dataset.learn) {
      case 'next':
        this.step = Math.min(3, this.step + 1);
        this.renderTurn();
        break;
      case 'back':
        this.step = Math.max(0, this.step - 1);
        this.renderTurn();
        break;
      case 'replay':
        this.step = 0;
        this.renderTurn();
        break;
      case 'claim-next':
        this.claimStep = Math.min(3, this.claimStep + 1);
        this.renderClaims();
        break;
      case 'claim-back':
        this.claimStep = Math.max(0, this.claimStep - 1);
        this.renderClaims();
        break;
      case 'claim-replay':
        this.claimStep = 0;
        this.renderClaims();
        break;
      case 'retry-claims':
        void this.loadClaims();
        break;
      case 'reset':
        this.groups = [[], [], [], [], []];
        this.target = 0;
        this.renderBuilder();
        this.host.querySelector('#build-result')!.textContent = 'Choose a group, then add tiles.';
        break;
      case 'hint':
        this.groups = [0, 3, 6, 9, 12].map((at, i) =>
          LESSON_HANDS[this.preset].slice(at, at + (i === 4 ? 2 : 3)),
        );
        this.renderBuilder();
        this.host.querySelector('#build-result')!.textContent =
          `Four sets and a pair. Check this ${LESSONS[this.preset].title} hand to see its score.`;
        break;
      case 'check': {
        const key = JSON.stringify([this.preset, this.groups]);
        b.disabled = true;
        try {
          const { check } = await this.command('lesson-check', {
            preset: this.preset,
            groups: this.groups,
          });
          if (this.disposed || key !== JSON.stringify([this.preset, this.groups])) return;
          const result = check as LessonCheck;
          this.host.querySelector('#build-result')!.innerHTML =
            `<strong>${result.valid ? '✓ Legal hand' : 'Try again'}</strong><p>${escape(result.message)}</p>${result.score ? `<div class="lesson-patterns">${result.score.patterns.map((p) => `<span>${escape(p.name)} · ${p.value}</span>`).join('')}</div>` : ''}`;
        } catch {
          if (!this.disposed)
            this.host.querySelector('#build-result')!.textContent =
              'Unable to check. Try again when connected.';
        } finally {
          b.disabled = false;
        }
        break;
      }
    }
  };
  dispose() {
    this.disposed = true;
    this.host.removeEventListener('click', this.click);
    this.host.removeEventListener('focusin', this.focus);
  }
}
