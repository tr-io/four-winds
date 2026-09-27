import { it, expect } from 'vitest';
import { newPlayer, startGame, gameView, applyAction } from '../server/engine';
import { PRESETS } from '../shared/rules';
import { remainingWallSlots } from '../shared/wall';
for (const preset of ['mcr', 'riichi', 'singapore'] as const)
  it(`${preset} setup conserves every tile, records legal dice and sequential packets, and hides tile order`, () => {
    for (let seed = 0; seed < 30; seed++) {
      const rules = PRESETS[preset],
        players = Array.from({ length: 4 }, (_, i) =>
          newPlayer({ id: String(i), name: String(i), avatar: 'jade', hands: 0, wins: 0 }, rules),
        );
      const g = startGame(rules, players, seed);
      expect(players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
      const all = [...g.wall, ...g.deadWall, ...players.flatMap((p) => [...p.hand, ...p.bonuses])];
      expect(new Set(all).size).toBe(g.setup!.total);
      expect(all).toHaveLength(g.setup!.total);
      expect(g.setup!.dice).toHaveLength(preset === 'mcr' ? 2 : 1);
      expect(g.setup!.dice.flat().every((d) => d >= 1 && d <= 6)).toBe(true);
      expect(g.setup!.deal.slice(0, 48).map((d) => d.seat)).toEqual(
        Array.from({ length: 48 }, (_, i) => Math.floor(i / 4) % 4),
      );
      const slots = remainingWallSlots(g.setup!);
      expect(slots).toHaveLength(g.wall.length + g.deadWall.length);
      const view = gameView(g, 0);
      expect(view).not.toHaveProperty('wall');
      expect(view).not.toHaveProperty('seed');
      expect(view.players[1].hand).toEqual([]);
      expect(Object.keys(view.setup!.deal[0])).toEqual(['seat', 'slot']);
      const hand = [...players[0].hand];
      applyAction(g, 0, g.decision, `discard:${hand[0]}`);
      expect(g.events.some((e) => e.type === 'discard')).toBe(true);
    }
  });
