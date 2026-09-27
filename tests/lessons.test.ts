import { describe, it, expect } from 'vitest';
import { checkLesson, lessonClaims } from '../server/lessons';
import { LESSON_HANDS } from '../shared/lessons';
describe('engine-backed lessons', () => {
  for (const preset of ['mcr', 'riichi', 'singapore'] as const) {
    it(`validates ${preset} shape and scoring, rejecting duplicate or malformed groups`, () => {
      const groups = [0, 3, 6, 9, 12].map((at, i) =>
        LESSON_HANDS[preset].slice(at, at + (i === 4 ? 2 : 3)),
      );
      expect(checkLesson({ preset, groups }).valid).toBe(true);
      expect(
        checkLesson({ preset, groups: [groups[0], groups[0], ...groups.slice(2)] }).valid,
      ).toBe(false);
      const wrong = structuredClone(groups);
      [wrong[0][0], wrong[4][0]] = [wrong[4][0], wrong[0][0]];
      expect(checkLesson({ preset, groups: wrong }).valid).toBe(false);
    });
    it(`resolves ${preset} competing claims through the actual engine`, () => {
      const claims = lessonClaims(preset);
      expect(claims.winner).toBe(2);
      expect(claims.meldWinner).toBe(preset === 'riichi' ? 0 : 1);
    });
  }
});
