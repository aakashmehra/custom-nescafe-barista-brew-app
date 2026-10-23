import type { BaristaModel, BaristaOptions, TemperatureMode } from '../machine/types';
import { BARISTA_CUSTOMIZABLE, BARISTA_MENU, type BaristaDrink } from './baristaMenu';
import type { Capsule } from './capsules';

/** "STARBUCKS® HOUSE BLEND" -> "Starbucks® House Blend" */
export const displayName = (c: Capsule) =>
  c.capsuleNameE.toLowerCase().replace(/(^|\s)(\S)/g, (_, s: string, ch: string) => s + ch.toUpperCase());

export const mlFor = (c: Capsule, level: number) =>
  c.barLevels.find((b) => b.amount === level)?.ml ?? level * 30;

export const liquidKind = (c: Capsule) =>
  c.brewingType === 3 || c.brewingType === 4 ? 'tea' : c.brewingType === 5 ? 'cocoa' : 'coffee';

/** Latte-type drinks get a milk layer in the cup. */
export const hasMilk = (c: Capsule) => c.category === 2 || c.brewingType === 2 || c.capsuleCount === 2;

export const canIce = (c: Capsule) => c.iceType === 1;

export const temperatures = (c: Capsule): TemperatureMode[] =>
  canIce(c) ? ['high', 'middle', 'low', 'cold'] : ['high', 'middle', 'low'];

export const TEMP_LABEL: Record<TemperatureMode, string> = { high: 'Hot', middle: 'Warm', low: 'Mild', cold: 'Cold' };

/** Cup capacity used for the fill preview (largest bar level across capsules). */
export const CUP_MAX_ML = 260;

// ---- Barista (instant coffee) ----

/**
 * The UI supports planning a large carafe-size drink. The machine protocol
 * still sends water in its supported 300 ml pours (see barista.ts).
 */
export const BARISTA_CUP_MAX_ML = 1000;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Water range for a strength value (ranges are indexed from strength.min). */
export const baristaWaterRange = (d: BaristaDrink, strength: number) => {
  const o = d.options!;
  const range = o.waterMl[clamp(strength - o.strength.min, 0, o.waterMl.length - 1)];
  // Every Barista recipe can fill a larger cup/carafe. Brew planning keeps
  // each individual machine pour within its protocol limit.
  return { ...range, max: BARISTA_CUP_MAX_ML };
};

/** Drinks the connected model offers; unknown model shows everything except model-specific extras. */
export const baristaDrinksFor = (model: BaristaModel | undefined) =>
  BARISTA_MENU.filter((d) => (model ? d.models.includes(model) : d.models.length > 1));

export const baristaCustomizable = (model: BaristaModel | undefined) => (model ? BARISTA_CUSTOMIZABLE[model] : true);

/** Strength / water / foam picked on the drink page (hot-water calibration is separate). */
export type BaristaBasics = Required<Pick<BaristaOptions, 'strength' | 'waterMl' | 'milkMl'>>;

export const baristaDefaults = (d: BaristaDrink): BaristaBasics => ({
  strength: d.options?.strength.default ?? 1,
  waterMl: d.options ? baristaWaterRange(d, d.options.strength.default).default : (d.defaultCupMl ?? 120),
  milkMl: d.options?.milkMl?.default ?? 0,
});
