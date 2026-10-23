// Nescafé Gold Blend Barista drink menu: drink list per model, option ranges (every model except Duo)
// and Japanese names. No value imports, so scripts/test-protocol.ts can load it in Node.
import type { BaristaModel } from '../machine/types';

export type BaristaDrinkId = 'espresso' | 'lungo' | 'xlungo' | 'cappuccino' | 'latte' | 'iced' | 'hotWater';

export interface BaristaRange {
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface BaristaDrinkOptions {
  // Coffee scoops ("taste" = coffee gauge turns). For hot water: temperature step (see temperatureC).
  strength: BaristaRange;
  // Water ml allowed for each strength value: waterMl[strength - strength.min].
  waterMl: BaristaRange[];
  // Milk-foam ("jet") water ml; only drinks that use the frother.
  milkMl?: BaristaRange;
  // Hot water only: °C shown for each strength step (display only).
  temperatureC?: number[];
}

export interface BaristaDrink {
  id: BaristaDrinkId;
  name: string;
  nameJa: string;
  description: string;
  // Total in the cup at the default options (water + milk), for previews.
  defaultCupMl?: number;
  // Models that offer this drink.
  models: BaristaModel[];
  options?: BaristaDrinkOptions;
  // Short preparation note.
  howTo?: string;
}

const r = (min: number, max: number, def: number, step = 10): BaristaRange => ({ min, max, default: def, step });
const taste = (min: number, max: number, def: number) => r(min, max, def, 1);

const ALL_HOT: BaristaModel[] = ['i', 'fifty', 'fifty5', 'duo', 'w', 'slim'];

export const BARISTA_MODEL_NAMES: Record<BaristaModel, string> = {
  i: 'Barista i',
  fifty: 'Barista 50',
  fifty5: 'Barista 50',
  simple: 'Barista Simple',
  duo: 'Barista Duo',
  w: 'Barista W',
  slim: 'Barista Slim',
};

// Duo: this app starts the machine's own stored recipe (one encrypted command), so options are ignored.
// Simple: the machine always uses one scoop, strength is ignored.
export const BARISTA_CUSTOMIZABLE: Record<BaristaModel, boolean> = {
  i: true,
  fifty: true,
  fifty5: true,
  simple: true,
  duo: false,
  w: true,
  slim: true,
};

export const BARISTA_MENU: BaristaDrink[] = [
  {
    id: 'espresso',
    name: 'Espresso type',
    nameJa: 'エスプレッソタイプ',
    description: 'Small, strong cup.',
    defaultCupMl: 80,
    models: [...ALL_HOT, 'simple'],
    options: { strength: taste(1, 5, 2), waterMl: [r(40, 60, 40), r(60, 120, 80), r(100, 180, 120)] },
  },
  {
    id: 'lungo',
    name: 'Black coffee',
    nameJa: 'ブラック',
    description: 'Regular black coffee.',
    defaultCupMl: 140,
    models: [...ALL_HOT, 'simple'],
    options: { strength: taste(1, 5, 2), waterMl: [r(40, 120, 70), r(70, 200, 140), r(100, 270, 210)] },
  },
  {
    id: 'xlungo',
    name: 'Black coffee (mug)',
    nameJa: 'ブラック（マグサイズ）',
    description: 'Mug-size black coffee.',
    defaultCupMl: 210,
    models: ALL_HOT,
    options: { strength: taste(2, 5, 3), waterMl: [r(70, 200, 140), r(100, 270, 210), r(130, 300, 280)] },
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    nameJa: 'カプチーノ',
    description: 'Coffee topped with frothed foam.',
    defaultCupMl: 180,
    models: ALL_HOT,
    options: {
      strength: taste(2, 5, 3),
      waterMl: [r(60, 180, 60), r(100, 220, 120), r(140, 240, 180)],
      milkMl: r(30, 60, 60),
    },
  },
  {
    id: 'latte',
    name: 'Café latte',
    nameJa: 'カフェラテ',
    description: 'Milder coffee with froth.',
    defaultCupMl: 160,
    models: [...ALL_HOT, 'simple'],
    options: {
      strength: taste(1, 5, 2),
      waterMl: [r(40, 80, 50), r(60, 180, 130), r(100, 220, 210)],
      milkMl: r(30, 60, 30),
    },
  },
  {
    id: 'iced',
    name: 'Iced coffee',
    nameJa: 'アイスコーヒー',
    description: 'Brewed hot straight onto ice.',
    defaultCupMl: 60,
    models: ['i', 'fifty', 'fifty5', 'simple', 'w', 'slim'],
    options: { strength: taste(1, 5, 2), waterMl: [r(40, 60, 40), r(60, 120, 60), r(100, 180, 100)] },
    howTo: 'Put ice in the cup first — about 3 cubes is ideal. Hot coffee is dispensed.',
  },
  {
    id: 'hotWater',
    name: 'Water only',
    nameJa: 'お湯',
    description: 'Dispenses hot water without coffee.',
    defaultCupMl: 160,
    // Barista Duo only supports its built-in encrypted drink commands. All
    // other Barista models accept a custom water-only recipe.
    models: ['i', 'fifty', 'fifty5', 'simple', 'w', 'slim'],
    options: {
      strength: taste(1, 3, 2),
      waterMl: [r(40, 300, 160), r(40, 300, 160), r(40, 300, 160)],
      temperatureC: [60, 70, 75],
    },
  },
];

export const getBaristaDrink = (id: string | undefined) => BARISTA_MENU.find((d) => d.id === id);

// Refill / care tips shown for machine alarms.
export const BARISTA_TIPS = {
  noWater: 'Fill the water tank with drinking water.',
  coffeeEmpty: 'The coffee powder tank is empty. Refill it.',
  coffeeLow: 'Coffee powder is running low. Refill it soon.',
  coffeeTankMissing: 'Fit the coffee tank correctly.',
  drawerOpen: 'Fit the brewing-unit cover back onto the machine.',
  rinse: 'The machine needs an internal rinse/clean.',
} as const;
