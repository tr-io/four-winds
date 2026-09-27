import { avatarChoice } from '../shared/avatars';

// Import URLs only: each SVG is fetched when displayed, with a content hash in production.
const images = import.meta.glob<string>('./generated/avatars/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});
export function avatarImage(value: string) {
  return images[`./generated/avatars/${avatarChoice(value).replace(':', '-')}.svg`];
}
export const avatarAttribution =
  '<p class="avatar-credit">Avatars by <a href="https://www.dicebear.com/" target="_blank" rel="noreferrer">DiceBear</a>. <a href="https://www.dicebear.com/styles/adventurer/" target="_blank" rel="noreferrer">Adventurer & Adventurer Neutral</a> by Lisa Wischofsky, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. <a href="https://www.dicebear.com/styles/bottts/" target="_blank" rel="noreferrer">Bottts</a> by Pablo Stanley, free for personal and commercial use. Colors and seeds customized with DiceBear.</p>';
