import type { GameView, HandAnalysis } from '../shared/types';
import { tileStatic } from './tile-art';
const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function winningHandHTML(g: GameView) {
  const winner = g.result?.winner;
  if (winner === null || winner === undefined) return '';
  const p = g.players[winner];
  const winning = g.result!.from === null ? p.drawn : g.lastClaim?.tile;
  const tiles = (hand: number[]) =>
    hand.map((t) => tileStatic(t, t === winning ? 'winning-tile' : '')).join('');
  return `<section class="complete-winning-hand" aria-label="Complete winning hand"><div class="winning-group concealed-group"><small>Concealed tiles</small><div>${tiles(g.result!.hands[winner])}</div></div>${p.melds.map((m) => `<div class="winning-group meld-${m.kind}"><small>${m.concealed ? 'Concealed ' : ''}${m.kind}</small><div>${tiles([...m.tiles].sort((a, b) => a - b))}</div></div>`).join('')}${p.bonuses.length ? `<div class="winning-group meld-bonus"><small>Bonus tiles</small><div>${tiles(p.bonuses)}</div></div>` : ''}<div class="hand-legend" aria-label="Hand colors"><span class="meld-chow">Chow / chi</span><span class="meld-pung">Pung / pon</span><span class="meld-kong">Kong / kan</span><span class="meld-bonus">Bonuses</span><span class="win-key">Winning tile</span></div></section>`;
}
export function winningRoutesHTML(analysis: HandAnalysis) {
  return `<p class="route-assumptions">Suggested completions · ordinary self-draw with your current melds, bonuses, and public dora. No future riichi, ura dora, replacement, or last-tile bonuses. Points can change before you win.</p>${analysis.routes.length ? analysis.routes.map((r, i) => `<article class="winning-route"><header><div><small>${r.needed.length ? `${r.needed.length} tiles needed` : 'Complete shape'}</small><h3>${esc(r.name)}</h3></div><strong>+${r.points.toLocaleString()}<small>points · ${r.score.value} ${r.score.unit}${r.score.fu ? ` / ${r.score.fu} fu` : ''}</small></strong></header><div class="route-changes">${r.discard.length ? `<div><small>Release</small>${r.discard.map((t) => tileStatic(t, 'mini')).join('')}</div>` : ''}${r.needed.length ? `<div><small>Collect</small>${r.needed.map((t) => tileStatic(t, 'mini')).join('')}</div>` : ''}</div><details ${i === 0 ? 'open' : ''}><summary>Winning combination & scoring</summary><div class="route-groups">${r.groups.map((group) => `<div class="route-group meld-${group.kind}"><small>${group.kind}</small><div>${group.tiles.map((t) => tileStatic(t, 'mini')).join('')}</div></div>`).join('')}</div><p class="field-help">One valid grouping is shown; scoring uses the best interpretation. Keep your declared melds shown in the Hand tab.</p><div class="route-patterns">${r.score.patterns.map((p) => `<span>${esc(p.name)} <b>+${p.value}</b></span>`).join('')}</div></details></article>`).join('') : '<div class="routes-empty">No qualifying route found in this bounded search. Keep building sets or try a different scoring pattern.</div>'}<p class="field-help">Suggestions use your tiles and public information only. They are not exhaustive, do not guarantee that missing tiles are available, and do not authorize a win claim.</p>`;
}
