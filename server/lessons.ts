import { z } from 'zod';
import { LESSON_HANDS, type LessonCheck, type LessonClaims } from '../shared/lessons';
import { PRESETS } from '../shared/rules';
import { kind, makeWall } from '../shared/tiles';
import { applyAction, legalActions, claimOptions, newPlayer, priority, startGame } from './engine';
import { scoreHand } from './scoring';
import type { Preset } from '../shared/types';
const presetSchema = z.enum(['mcr', 'riichi', 'singapore']);
function lessonGame(preset: Preset) {
  const rules = structuredClone(PRESETS[preset]);
  const players = ['You', 'Mei', 'Jun', 'Sora'].map((name, i) =>
    newPlayer({ id: `lesson-${i}`, name, avatar: 'adventurer:0', hands: 0, wins: 0 }, rules),
  );
  const g = startGame(rules, players, 9102, 0);
  for (const p of players) {
    p.hand = [];
    p.bonuses = [];
    p.melds = [];
    p.discards = [];
    p.drawn = null;
    p.hasDrawn = p.hasDiscarded = true;
  }
  g.interrupted = true;
  return g;
}
function remainingLessonTiles(g: ReturnType<typeof lessonGame>) {
  const used = new Set(g.players.flatMap((p) => p.hand));
  g.wall = makeWall(g.rules.preset, 1729).filter((t) => !used.has(t));
  g.deadWall = g.rules.preset === 'riichi' ? g.wall.splice(-14) : [];
  g.dora = g.deadWall.length ? [g.deadWall[4]] : [];
}
export function checkLesson(input: unknown): LessonCheck {
  const { preset, groups } = z
    .object({
      preset: presetSchema,
      groups: z.array(z.array(z.number().int().min(0).max(135)).max(4)).length(5),
    })
    .parse(input);
  const tiles = groups.flat();
  if (
    tiles.length !== 14 ||
    new Set(tiles).size !== 14 ||
    tiles.some((t) => !LESSON_HANDS[preset].includes(t))
  )
    return {
      valid: false,
      message: 'Use each of the fourteen tiles exactly once: four sets of three and one pair.',
    };
  for (let i = 0; i < 5; i++) {
    const ks = groups[i].map(kind).sort((a, b) => a - b);
    if (i === 4) {
      if (ks.length !== 2 || ks[0] !== ks[1])
        return { valid: false, message: 'The pair needs two tiles of the same kind.' };
    } else if (
      ks.length !== 3 ||
      !(
        ks.every((k) => k === ks[0]) ||
        (ks[0] < 27 &&
          Math.floor(ks[0] / 9) === Math.floor(ks[2] / 9) &&
          ks[1] === ks[0] + 1 &&
          ks[2] === ks[0] + 2)
      )
    )
      return {
        valid: false,
        message: `Set ${i + 1} needs three identical tiles or three consecutive ranks in one suit.`,
      };
  }
  const g = lessonGame(preset),
    p = g.players[0];
  p.hand = tiles;
  p.drawn = tiles.at(-1)!;
  p.drawSource = 'wall';
  remainingLessonTiles(g);
  const score = scoreHand(g, 0, p.drawn, null);
  return score
    ? {
        valid: true,
        message: `Legal ${PRESETS[preset].name} self-draw: ${score.value} ${score.unit}. The engine checks the whole hand and may find another grouping with a higher score.`,
        score,
      }
    : {
        valid: false,
        message:
          'The groups form a complete shape, but this hand does not meet the selected preset’s scoring requirement.',
      };
}
export function lessonClaims(input: unknown): LessonClaims {
  const preset = presetSchema.parse(input);
  const g = lessonGame(preset);
  g.turn = 3;
  g.players[0].hand = [0, 8];
  g.players[1].hand = [5, 6];
  g.players[2].hand = [72, 73, 74, 76, 77, 78, 80, 81, 82, 84, 85, 86, 7];
  g.players[3].hand = [4];
  const used = new Set(g.players.flatMap((p) => p.hand));
  const pool = Array.from({ length: 136 }, (_, i) => i).filter((t) => !used.has(t));
  for (const seat of [0, 1, 3])
    while (g.players[seat].hand.length < (seat === 3 ? 14 : 13))
      g.players[seat].hand.push(pool.shift()!);
  remainingLessonTiles(g);
  const responses = [0, 1, 2].map((seat) => {
    const action = claimOptions(g, seat, 4, 3).find(
      (a) => a.kind === (seat === 0 ? 'chow' : seat === 1 ? 'pung' : 'win'),
    );
    if (!action) throw new Error(`Invalid lesson fixture: ${preset}, seat ${seat}`);
    return {
      seat,
      name: g.players[seat].profile.name,
      kind: action.kind,
      tiles: seat === 2 ? [...g.players[seat].hand, 4] : [...action.tiles, 4],
      priority: priority(g, action.kind),
    };
  });
  const resolve = (winning: boolean) => {
    const copy = structuredClone(g);
    applyAction(copy, 3, copy.decision, 'discard:4', 1);
    for (const response of responses) {
      const options = legalActions(copy, response.seat);
      if (!copy.claim) break;
      const action = options.find(
        (a) => a.kind === (response.seat === 2 && !winning ? 'pass' : response.kind),
      );
      if (action) applyAction(copy, response.seat, copy.decision, action.id, 2 + response.seat);
    }
    return copy.result?.winner ?? copy.lastClaim?.seat ?? -1;
  };
  return {
    discard: 4,
    responses,
    winner: resolve(true),
    meldWinner: resolve(false),
    explanation:
      preset === 'riichi'
        ? 'Chi arrived first. With equal meld priority in this preset, it beats the later pon when the winning player passes.'
        : 'Pung has higher priority than chow, so it wins even though chow arrived first when the winning player passes.',
  };
}
