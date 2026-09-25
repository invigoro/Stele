/** Every kind of damage, each with its own slider under "Damage types". */
export const DAMAGE_TYPES = {
  chips: 'Chips',
  breaks: 'Broken edges',
  cracks: 'Cracks',
  stains: 'Stains and soot',
  lichen: 'Lichen and moss',
  pitting: 'Pitting',
  flaking: 'Flaking',
  splits: 'Splits along the grain',
  gouges: 'Gouges',
  rot: 'Rot',
  holes: 'Holes',
  burns: 'Burns',
  water: 'Water damage',
  tears: 'Tears',
  folds: 'Folds',
  smudges: 'Smudges',
  blots: 'Ink blots',
  foxing: 'Age spots',
  fraying: 'Frayed edges',
  darkening: 'Darkening',
} as const;

export type DamageId = keyof typeof DAMAGE_TYPES;

/** Per-type weights (0–1); the main Damage slider scales them all. */
export type DamageMix = Partial<Record<DamageId, number>>;

/** How strong each type actually is: the main amount times that type's weight. */
export function damageAmounts(amount: number, mix: DamageMix): Partial<Record<DamageId, number>> {
  return Object.fromEntries(
    Object.entries(mix).map(([id, weight]) => [id, Math.min(1, Math.max(0, amount * (weight ?? 0)))]),
  );
}
