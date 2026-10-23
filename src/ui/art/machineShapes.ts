// Capsule coffee machine geometry on a 240x300 canvas, as plain shape data (no RN imports)
// so Machine.tsx and the Node render check share it. Moving parts are worklet path builders.
import type { El } from './drinks';

const INK = '#2B1D14';
const BODY = '#E0533F';
const SHADE = '#BE3F2E';
const CAP = '#3A3230';
const CHROME = '#C9CED6';
const CHROME_DK = '#8E959F';

export const M = {
  spoutX: 90,
  spoutY: 121,
  cupTop: 158,
  cupSize: 96,
  /** Cup.tsx mug rim sits 60/240 of its height below its top; its height is size*1.2 */
  rimY: 158 + (60 / 240) * 96 * 1.2,
  pivotX: 184,
  pivotY: 35,
  leverLen: 74,
  /** lever angle (deg, negative = raised) while the slot is open */
  leverUp: -22,
  capsuleFrom: 2,
  capsuleTo: 52,
  ink: INK,
  chrome: CHROME,
} as const;

const s = (sw: number) => ({ stroke: INK, strokeWidth: sw, strokeLinejoin: 'round', strokeLinecap: 'round' });
const P = (d: string, fill: string, sw = 2.4): El => ({ t: 'path', a: { d, fill, ...(sw ? s(sw) : {}) } });
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, sw = 2.4): El => ({
  t: 'rect',
  a: { x, y, width: w, height: h, rx, fill, ...(sw ? s(sw) : {}) },
});
const C = (cx: number, cy: number, r: number, fill: string, sw = 0): El => ({ t: 'circle', a: { cx, cy, r, fill, ...(sw ? s(sw) : {}) } });
const hi = (d: string, op = 0.35): El => ({ t: 'path', a: { d, fill: 'none', stroke: '#FFFFFF', strokeWidth: 4, strokeLinecap: 'round', strokeOpacity: op } });

/** Water tank, drawn behind the body. */
export const machineBack: El[] = [
  R(186, 66, 38, 176, 10, '#D6EEF8'),
  P('M190 126 H220 V232 Q220 238 214 238 H196 Q190 238 190 232 Z', '#86C9EA', 0),
  P('M190 126 Q197 122 205 126 T220 126', 'none', 1.6),
  hi('M216 78 V114', 0.8),
  R(183, 58, 44, 12, 5, CAP),
];

/** Body, head, spout, tray: drawn over the capsule. */
export const machineBody: El[] = [
  // base / drip tray
  R(24, 258, 186, 22, 9, CAP),
  // column + head
  P('M58 40 H184 Q204 40 204 60 V262 H134 V108 H58 Q36 108 36 86 V62 Q36 40 58 40 Z', BODY),
  P('M190 62 Q190 50 198 46 Q204 50 204 60 V262 H190 Z', SHADE, 0),
  P('M58 40 H184 Q204 40 204 60 V60 H36 V62 Q36 40 58 40 Z', CAP),
  // capsule slot in the lid
  R(72, 40, 36, 6, 3, '#151110', 1.6),
  // head underside lip and front seam
  P('M44 100 H134', 'none', 1.6),
  hi('M46 70 V90'),
  hi('M144 120 V236', 0.28),
  // spout
  R(78, 106, 24, 9, 3, CHROME),
  R(84, 113, 12, 8, 3, CHROME_DK),
  // status light bezel
  C(169, 132, 11, CAP, 2.4),
  // drip grate
  R(36, 254, 104, 8, 4, CHROME),
  P('M50 258 H126', 'none', 1.4),
  // lever hub
  C(M.pivotX, M.pivotY, 7, CAP, 2.4),
];

export const machineFront: El[] = [C(M.pivotX, M.pivotY, 2.6, CHROME)];

/** Lever arm + knob, rotated `deg` around the pivot (negative raises the front). */
export function leverD(deg: number): { arm: string; knob: string } {
  'worklet';
  const a = (deg * Math.PI) / 180;
  const kx = M.pivotX - M.leverLen * Math.cos(a);
  const ky = M.pivotY + M.leverLen * Math.sin(a);
  return {
    arm: `M${M.pivotX} ${M.pivotY} L${kx.toFixed(1)} ${ky.toFixed(1)}`,
    knob: `M${(kx - 7).toFixed(1)} ${ky.toFixed(1)} a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0`,
  };
}

/** Side view of a capsule whose lid top is at y. */
export function capsuleD(y: number): { body: string; lid: string } {
  'worklet';
  const x = M.spoutX;
  return {
    body: `M${x - 12} ${y + 4} L${x - 8} ${y + 20} Q${x - 7} ${y + 23} ${x - 4} ${y + 23} H${x + 4} Q${x + 7} ${y + 23} ${x + 8} ${y + 20} L${x + 12} ${y + 4} Z`,
    lid: `M${x - 15} ${y} H${x + 15} V${y + 4} H${x - 15} Z`,
  };
}

export const streamD = `M${M.spoutX} ${M.spoutY} V${M.rimY + 8}`;

/** A falling drop at progress p (0 at the spout, 1 at the cup rim). */
export function dropD(p: number): string {
  'worklet';
  const y = M.spoutY + 2 + p * (M.rimY + 6 - M.spoutY);
  const x = M.spoutX;
  return `M${x} ${(y - 5).toFixed(1)} Q${x + 3.6} ${(y + 0.5).toFixed(1)} ${x} ${(y + 2.6).toFixed(1)} Q${x - 3.6} ${(y + 0.5).toFixed(1)} ${x} ${(y - 5).toFixed(1)} Z`;
}

export type LiquidKind = 'coffee' | 'tea' | 'cocoa';
/** Stream colour for a Cup kind/milk combo. */
export function streamColor(kind: LiquidKind = 'coffee', milk = false): string {
  const base = { coffee: '#6B3E1F', tea: '#B8692A', cocoa: '#6B3A22' }[kind];
  return milk ? { coffee: '#A8714A', tea: '#C99568', cocoa: '#8E5A3C' }[kind] : base;
}
export const capsuleColor = (kind: LiquidKind = 'coffee') => ({ coffee: '#7A4A2B', tea: '#C98A2E', cocoa: '#8A4A30' })[kind];

export const LIGHT = { off: '#5A524E', pulse: '#FFB23F', on: '#4CD964' } as const;
