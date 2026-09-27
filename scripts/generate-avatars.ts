import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAvatar } from '@dicebear/core';
import * as adventurer from '@dicebear/adventurer';
import * as neutral from '@dicebear/adventurer-neutral';
import * as bottts from '@dicebear/bottts';
import { AVATAR_CHOICES } from '../shared/avatars';

// Preserve the existing seeds, colors, and dimensions exactly. Attribution stays in the UI.
const directory = new URL('../client/generated/avatars/', import.meta.url);
const check = process.argv.includes('--check');
if (!check) mkdirSync(directory, { recursive: true });
for (const choice of AVATAR_CHOICES) {
  const [style, seed] = choice.split(':');
  const definition =
    style === 'bottts' ? bottts : style === 'adventurer-neutral' ? neutral : adventurer;
  const svg = createAvatar(definition as typeof adventurer, {
    seed: `Four Winds ${seed}`,
    backgroundColor: ['c7e7d7', 'e8d5ae', 'b6cfd5', 'dec5b8'],
    size: 96,
  }).toString();
  const path = new URL(`${style}-${seed}.svg`, directory);
  if (check) {
    if (readFileSync(path, 'utf8') !== svg)
      throw new Error(`Regenerate ${fileURLToPath(path)} with npm run avatars:generate`);
  } else writeFileSync(path, svg);
}
console.log(`${check ? 'Verified' : 'Generated'} ${AVATAR_CHOICES.length} avatar SVGs.`);
