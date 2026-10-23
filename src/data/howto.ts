// "How to make" guidance built from the capsule data in src/data/capsules.ts.
import { planHotWater } from '../machine/protocol/barista';
import type { BaristaModel, HotWaterCalibration } from '../machine/types';
import { BARISTA_TIPS, type BaristaDrink } from './baristaMenu';
import type { Capsule } from './capsules';
import { baristaCustomizable, canIce, displayName, mlFor, type BaristaBasics } from './drink';

export interface HowTo {
  capsules: 1 | 2;
  /** volume brewed through the drink (coffee/tea) capsule */
  drinkLevel: number;
  drinkMl: number;
  /** milk capsule brew, two-capsule drinks only */
  milkLevel?: number;
  milkMl?: number;
  totalMl: number;
  steps: string[];
  tips: string[];
}

const secondCapsule = (c: Capsule) =>
  c.brewingType === 3 ? 'tea' : c.brewingType === 4 ? 'matcha' : c.brewingType === 5 ? 'chocolate' : 'coffee';

export function howTo(c: Capsule): HowTo {
  const two = c.capsuleCount === 2;
  const drinkMl = mlFor(c, c.recommendAmount);
  const iced = canIce(c);
  const name = displayName(c);
  const cup = iced ? 'Fill a tall glass with ice first (about 3 cubes) and set it on the drip tray.' : 'Set your cup on the drip tray.';

  const steps = ['Fill the water tank with fresh water.', cup];
  const tips: string[] = [];

  if (two) {
    const second = secondCapsule(c);
    steps.push(
      `Insert the milk capsule first and brew level ${c.milkRecommendAmount} (about ${c.milkRecommendMl} ml).`,
      `Remove the milk capsule, insert the ${second} capsule and brew level ${c.recommendAmount} (about ${drinkMl} ml).`,
    );
    tips.push('Have the second capsule ready while the milk brews.');
  } else {
    steps.push(`Insert the ${name} capsule.`, `Brew level ${c.recommendAmount} (about ${drinkMl} ml).`);
    if (c.category !== 2 && c.brewingType === 1) tips.push(`Like it milky? Add about ${c.milkRecommendMl} ml of warm milk.`);
  }
  steps.push('Remove the used capsule when it’s done.');

  if (iced) tips.push('Iced capsules brew at room temperature, so add the ice before brewing.');
  if (c.category === 2 && !two) tips.push('The milk is already in this capsule, no extra milk needed.');

  const totalMl = drinkMl + (two ? c.milkRecommendMl : 0);
  tips.push(`Total is about ${totalMl} ml, so pick a cup that won’t overflow.`);

  return {
    capsules: two ? 2 : 1,
    drinkLevel: c.recommendAmount,
    drinkMl,
    milkLevel: two ? c.milkRecommendAmount : undefined,
    milkMl: two ? c.milkRecommendMl : undefined,
    totalMl,
    steps,
    tips,
  };
}

// ---- Barista ----

export interface BaristaHowTo {
  facts: [string, string][];
  steps: string[];
  tips: string[];
}

export function baristaHowTo(
  d: BaristaDrink,
  o: BaristaBasics,
  opts: { model?: BaristaModel; coffee?: 'ok' | 'low' | 'empty'; hotWater?: HotWaterCalibration | null },
): BaristaHowTo {
  if (d.id === 'hotWater' && opts.model === 'w') return wHotWaterHowTo(o.waterMl, opts.hotWater ?? null);
  const custom = baristaCustomizable(opts.model);
  const water = d.id === 'hotWater';
  const temp = d.options?.temperatureC?.[o.strength - (d.options?.strength.min ?? 1)];
  const facts: [string, string][] = custom
    ? [
        water ? ['Temperature', temp ? `${temp}°C` : '—'] : ['Coffee', `${o.strength} scoop${o.strength > 1 ? 's' : ''}`],
        ['Water', `${o.waterMl} ml`],
        ...(o.milkMl ? ([['Foam', `${o.milkMl} ml`]] as [string, string][]) : []),
      ]
    : [['Recipe', 'Machine’s own']];

  const steps: string[] = [BARISTA_TIPS.noWater];
  if (!water) steps.push('Check the coffee powder tank and top it up with Gold Blend if it’s getting low.');
  steps.push(d.howTo ?? (d.id === 'xlungo' ? 'Place a mug under the spout.' : 'Place your cup under the spout.'));
  steps.push(
    custom
      ? `Tap Brew${o.milkMl ? '. The frother makes the foam for you' : ''}.`
      : 'Tap Brew. The machine uses its stored recipe for this drink.',
  );
  steps.push('Wait until the machine is quiet before taking the cup.');

  const tips: string[] = [d.description];
  if (opts.coffee === 'low') tips.push(BARISTA_TIPS.coffeeLow);
  if (opts.coffee === 'empty') tips.push(BARISTA_TIPS.coffeeEmpty);
  if (opts.model === 'simple' && !water) tips.push('Barista Simple always uses one scoop of coffee.');
  if (!custom) tips.push('Barista Duo can’t take custom strength or volume from the app.');
  tips.push(`About ${o.waterMl + o.milkMl} ml in total, so pick a cup that won’t overflow.`);
  return { facts, steps, tips };
}

/** Barista W has no water-only recipe: hot water is made of rinse cycles, the last one maybe cut short. */
function wHotWaterHowTo(targetMl: number, cal: HotWaterCalibration | null): BaristaHowTo {
  const plan = cal ? planHotWater(targetMl, cal) : null;
  const facts: [string, string][] = cal
    ? [
        ['Rinses', String(plan!.pours.length)],
        ['Water', `≈ ${plan!.totalMl} ml`],
        ['1 rinse', `${cal.rinseMl} ml`],
      ]
    : [['Setup', 'Not done yet']];
  const steps = [
    BARISTA_TIPS.noWater,
    plan
      ? `Use a cup or jug that holds at least ${plan.totalMl} ml and place it under the spout.`
      : 'Set up hot water once: Settings → Hot water (about a minute, with a measuring cup).',
    'Tap Brew. The Barista runs its rinse cycle one or more times, with a short pause between pours.',
    'Wait until the last pour finishes before taking the cup.',
  ];
  const tips = [
    'Barista W has no hot-water button, so Brew uses rinse cycles. No coffee is used.',
    cal && cal.stop === 'none'
      ? `Your machine can’t stop a rinse early, so amounts come in ${cal.rinseMl} ml steps.`
      : 'The last pour is stopped early to hit the amount, so it can be off by a few ml.',
    'Rinse water temperature can’t be set. Recalibrate in Settings if the amounts drift.',
  ];
  return { facts, steps, tips };
}
