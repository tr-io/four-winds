import type { GameView } from '../shared/types';
import { DEAL } from './deal-sequence';
const calls: Record<string, [string, string]> = {
  pung: ['碰', 'PUNG'],
  chow: ['吃', 'CHOW'],
  kong: ['槓', 'KONG'],
  'concealed kong': ['槓', 'CONCEALED KONG'],
  'added kong': ['槓', 'KONG'],
  win: ['和', 'MAHJONG'],
  riichi: ['立直', 'RIICHI'],
};

export class TableEffects {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seen = '';
  constructor(private host: HTMLElement) {}
  deal(game: GameView) {
    const hand = game.handNumber;
    clearTimeout(this.timer);
    const effect = document.createElement('div');
    effect.className = 'deal-effect';
    effect.dataset.effect = 'deal';
    effect.setAttribute('role', 'status');
    effect.setAttribute('aria-label', `Hand ${hand}. Shuffling and dealing tiles.`);
    effect.innerHTML = `<div class="deal-halo" aria-hidden="true"></div><div class="deal-winds" aria-hidden="true"><i>東</i><i>南</i><i>西</i><i>北</i></div><div class="deal-caption"><small>HAND ${hand}</small><strong>THE WINDS GATHER</strong><span class="shuffle-label">SHUFFLE</span><span class="deal-label">DEAL · EAST BEGINS</span></div>`;
    if (game.setup) {
      const dice = document.createElement('div');
      dice.className = 'setup-dice';
      const glyphs = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      dice.innerHTML =
        game.setup.dice
          .map(
            (roll, i) =>
              `<div class="dice-throw throw-${i}" style="--throw:${i}"><small>${i === 0 ? 'EAST ROLLS' : 'SECOND THROW'}</small><div>${roll.map((n) => `<span class="rolling-die" aria-label="Die ${n}">${glyphs[n]}</span>`).join('')}</div><b>${roll.reduce((a, b) => a + b, 0)}</b></div>`,
          )
          .join('') +
        `<p>Break after stack ${game.setup.breakStack} · deal clockwise from the gap</p>`;
      effect.append(dice);
    }
    this.host.replaceChildren(effect);
    this.timer = setTimeout(() => this.host.replaceChildren(), DEAL.duration);
  }
  play(id: string, kind: string, player: string, detail: string) {
    if (id === this.seen) return;
    this.seen = id;
    clearTimeout(this.timer);
    const [glyph, label] = calls[kind] ?? ['風', kind.toUpperCase()];
    this.host.replaceChildren();
    const effect = document.createElement('div');
    effect.className = `call-effect ${kind === 'win' ? 'win-effect' : ''}`;
    effect.dataset.effect = kind;
    effect.setAttribute('role', 'status');
    effect.innerHTML = `<div class="impact-frame" aria-hidden="true"></div><div class="fire-aura" aria-hidden="true">${Array.from({ length: kind === 'win' ? 18 : 10 }, (_, i) => `<i style="--ember:${i};--x:${(i * 61) % 100}%;--rise:${110 + (i % 5) * 24}px"></i>`).join('')}</div><div class="effect-rays" aria-hidden="true"></div><div class="effect-ring" aria-hidden="true"></div><div class="call-cut"><span class="call-glyph" aria-hidden="true"></span><div><span class="call-player"></span><strong class="call-title"></strong><small class="call-detail"></small></div></div><div class="effect-particles" aria-hidden="true"></div>`;
    effect.querySelector('.call-glyph')!.textContent = glyph;
    effect.querySelector('.call-player')!.textContent = player;
    effect.querySelector('.call-title')!.textContent = label;
    effect.querySelector('.call-detail')!.textContent = detail;
    const particles = effect.querySelector('.effect-particles')!;
    for (let i = 0; i < (kind === 'win' ? 30 : 12); i++) {
      const particle = document.createElement('i');
      particle.style.setProperty('--angle', `${i * 137.5}deg`);
      particle.style.setProperty('--distance', `${100 + (i % 7) * 36}px`);
      particle.style.setProperty('--delay', `${(i % 5) * 30}ms`);
      particles.append(particle);
    }
    this.host.append(effect);
    this.timer = setTimeout(() => this.host.replaceChildren(), kind === 'win' ? 2600 : 1650);
  }
  dispose() {
    clearTimeout(this.timer);
    this.host.replaceChildren();
  }
}
