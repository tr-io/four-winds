import { createAvatar } from '@dicebear/core';
import * as adventurer from '@dicebear/adventurer';
import * as neutral from '@dicebear/adventurer-neutral';
import * as bottts from '@dicebear/bottts';
import { avatarChoice } from '../shared/avatars';
const cache = new Map<string, string>();
export function avatarImage(value: string) {
  const choice = avatarChoice(value);
  if (!cache.has(choice)) {
    const [style, seed] = choice.split(':');
    const definition =
      style === 'bottts' ? bottts : style === 'adventurer-neutral' ? neutral : adventurer;
    cache.set(
      choice,
      createAvatar(definition as typeof adventurer, {
        seed: `Four Winds ${seed}`,
        backgroundColor: ['c7e7d7', 'e8d5ae', 'b6cfd5', 'dec5b8'],
        size: 96,
      }).toDataUri(),
    );
  }
  return cache.get(choice)!;
}
export const avatarAttribution =
  '<p class="avatar-credit">Avatars by <a href="https://www.dicebear.com/" target="_blank" rel="noreferrer">DiceBear</a>. <a href="https://www.dicebear.com/styles/adventurer/" target="_blank" rel="noreferrer">Adventurer & Adventurer Neutral</a> by Lisa Wischofsky, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. <a href="https://www.dicebear.com/styles/bottts/" target="_blank" rel="noreferrer">Bottts</a> by Pablo Stanley, free for personal and commercial use. Colors and seeds customized with DiceBear.</p>';
