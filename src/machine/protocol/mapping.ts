// App-level choices -> recipe parameters.
import type { BrewRequest, FigaroRecipeType, MachineFamily, TemperatureMode } from '../types';
import type { FigaroRecipe } from './figaro';
import type { GenioRecipe } from './genio';

// Subset of a capsule entry (src/data/capsules.ts) that affects the recipe.
export interface CapsuleInfo {
  iceType: number;
  capsuleCount: number;
}

// Brew mode (Figaro only): normal -> hot, espresso -> espressoBoost, handdrip -> delicateBrew.
export type FigaroBrewMode = 'normal' | 'espresso' | 'handdrip';
const MODE_TYPE: Record<FigaroBrewMode, FigaroRecipeType> = {
  normal: 'hot',
  espresso: 'espressoBoost',
  handdrip: 'delicateBrew',
};

// HIGH 87, MIDDLE 82 (also the default), LOW 77; cold extraction forces 20.
export const TEMPERATURE_C: Record<TemperatureMode, number> = { high: 87, middle: 82, low: 77, cold: 20 };

// Cold extraction = (iceType == 1 && capsuleCount == 2) || the user picked 'cold'.
// The capsule data carries no per-capsule temperature, so the UI's 'cold' choice stands in for it.
// `request.iced` alone does not change bytes: single-capsule iced drinks (ICED COFFEE BLEND) are
// brewed hot over ice.
export const isColdExtraction = (req: BrewRequest, c: CapsuleInfo) =>
  req.temperature === 'cold' || (c.iceType === 1 && c.capsuleCount === 2);

function level(req: BrewRequest) {
  // amount 0..8 maps 1:1 onto the volume level byte.
  if (!Number.isInteger(req.volumeLevel) || req.volumeLevel < 0 || req.volumeLevel > 8)
    throw new RangeError('volumeLevel must be 0..8');
  return req.volumeLevel;
}

export function toFigaroRecipe(req: BrewRequest, c: CapsuleInfo, mode: FigaroBrewMode = 'normal'): FigaroRecipe {
  const cold = isColdExtraction(req, c);
  return {
    level: level(req),
    recipeType: cold ? 'cold' : MODE_TYPE[mode],
    temperature: cold ? 20 : TEMPERATURE_C[req.temperature],
    intensity: req.intensity ?? 0, // prewet time defaults to 0
  };
}

export function toGenioRecipe(req: BrewRequest, c: CapsuleInfo): GenioRecipe {
  const cold = isColdExtraction(req, c);
  return {
    level: level(req),
    extraction: cold ? 'cold' : 'hot',
    temperature: cold ? 20 : TEMPERATURE_C[req.temperature], // same °C as Figaro
  };
}

// Family is decided by the advertised local name prefix (case-insensitive).
export function familyFromName(name: string | null | undefined): MachineFamily | null {
  const n = name?.toLowerCase() ?? '';
  if (n.startsWith('esperta')) return 'figaro';
  if (n.startsWith('geniosan')) return 'genio';
  return null;
}
