import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import type { BaristaDrinkId } from '../data/baristaMenu';
import { DrinkArt } from './art/DrinkArt';
import { drinkPalette, onAccent, type DrinkPalette } from './art/palette';

// Barista drinks reuse the closest Dolce Gusto illustration; hot water gets its own glyph.
const ART_ID: Record<BaristaDrinkId, number | null> = {
  espresso: 24,
  lungo: 21,
  xlungo: 1,
  cappuccino: 9,
  latte: 10,
  iced: 25,
  hotWater: null,
};

const WATER: DrinkPalette = { base: '#DCEFF7', accent: '#3E8FB8', liquid: '#CFE7F2' };

export const baristaPalette = (id: BaristaDrinkId): DrinkPalette => {
  const art = ART_ID[id];
  return art == null ? WATER : drinkPalette(art);
};

export const baristaOnAccent = (id: BaristaDrinkId): '#000000' | '#FFFFFF' => {
  const art = ART_ID[id];
  return art == null ? '#FFFFFF' : onAccent(art);
};

export function BaristaArt({ id, size }: { id: BaristaDrinkId; size: number }) {
  const art = ART_ID[id];
  if (art != null) return <DrinkArt capsuleId={art} size={size} />;
  return <HotWaterArt size={size} />;
}

/** Teacup of hot water, flat style matching src/ui/art (120x120 canvas). */
function HotWaterArt({ size }: { size: number }) {
  const ink = { stroke: '#2B1D14', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Ellipse cx={60} cy={100} rx={44} ry={8} fill="#FAF6F0" {...ink} />
      <Path d="M86 62 C102 62 102 84 84 86" fill="none" stroke="#2B1D14" strokeWidth={9} strokeLinecap="round" />
      <Path d="M86 62 C102 62 102 84 84 86" fill="none" stroke="#FAF6F0" strokeWidth={5} strokeLinecap="round" />
      <Path d="M26 52 H94 L88 86 Q86 96 76 96 H44 Q34 96 32 86 Z" fill="#FAF6F0" {...ink} />
      <Ellipse cx={60} cy={52} rx={34} ry={7.5} fill={WATER.liquid} {...ink} />
      <Rect x={50} y={70} width={20} height={4} rx={2} fill={WATER.accent} />
      <Path d="M48 40 C44 34 52 30 48 22 M62 40 C58 34 66 30 62 22 M76 40 C72 34 80 30 76 22" fill="none" stroke="#B3A79C" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
