export const AVATAR_STYLES = ['adventurer', 'adventurer-neutral', 'bottts'] as const;
export const AVATAR_CHOICES = AVATAR_STYLES.flatMap((style) =>
  Array.from({ length: 8 }, (_, i) => `${style}:${i}`),
);
export function avatarChoice(value: string) {
  return AVATAR_CHOICES.includes(value)
    ? value
    : `adventurer:${Math.max(0, ['jade', 'clay', 'gold', 'blue'].indexOf(value))}`;
}
export const REACTIONS = ['👋', '😊', '👏', '🎉', '🤔', '🍀'] as const;
