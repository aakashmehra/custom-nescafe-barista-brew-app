// Drink illustrations as plain shape data (no RN imports) so both DrinkArt.tsx and a Node
// render script can draw them. 120x120 canvas, front view with a slight top-down tilt.

type Attrs = Record<string, string | number>;
export interface El {
  t: 'path' | 'rect' | 'circle' | 'ellipse' | 'text';
  a: Attrs;
  text?: string;
}
export interface DrinkPalette {
  base: string;
  accent: string;
  liquid: string;
  foam?: string;
}

const INK = '#2B1D14';
const W = '#FFFFFF';
const CERAMIC = '#FAF6F0';
const GLASS = '#DDEEF5';
const STEAM = '#B3A79C';
const DECAF = '#F28C3A';
const BAMBOO = '#D9B77A';
const FOAM = '#F8F0E4';
const K = 0.22; // ellipse squash for the viewing tilt

const n = (v: number) => Math.round(v * 10) / 10;
const stroke = (sw: number, color = INK): Attrs =>
  sw ? { stroke: color, strokeWidth: sw, strokeLinejoin: 'round', strokeLinecap: 'round' } : {};
const P = (d: string, fill: string, sw = 2, color = INK, extra: Attrs = {}): El => ({
  t: 'path',
  a: { d, fill, ...stroke(sw, color), ...extra },
});
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, sw = 2, color = INK, extra: Attrs = {}): El => ({
  t: 'ellipse',
  a: { cx: n(cx), cy: n(cy), rx: n(rx), ry: n(ry), fill, ...stroke(sw, color), ...extra },
});
const C = (cx: number, cy: number, r: number, fill: string): El => ({ t: 'circle', a: { cx: n(cx), cy: n(cy), r, fill } });
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, sw = 2): El => ({
  t: 'rect',
  a: { x, y, width: w, height: h, rx, fill, ...stroke(sw) },
});
const L = (d: string, color: string, sw: number, extra: Attrs = {}): El => P(d, 'none', sw, color, extra);

// ---- vessels ---------------------------------------------------------------

/** A (possibly tapered) round vessel: radius rt at the rim `top`, rb at the base `bot`. */
interface V {
  cx: number;
  rt: number;
  rb: number;
  top: number;
  bot: number;
}
const rAt = (v: V, y: number) => v.rt + ((v.rb - v.rt) * (y - v.top)) / (v.bot - v.top);

const bodyD = ({ cx, rt, rb, top, bot }: V) =>
  `M${n(cx - rt)} ${top}L${n(cx - rb)} ${bot}A${rb} ${n(rb * K)} 0 0 0 ${n(cx + rb)} ${bot}L${n(cx + rt)} ${top}Z`;

/** Region between two horizontal slices of a vessel; edges curve toward the viewer. */
function bandD(v: V, y1: number, y2: number, inset = 0) {
  const r1 = rAt(v, y1) - inset;
  const r2 = rAt(v, y2) - inset;
  const { cx } = v;
  return (
    `M${n(cx - r1)} ${y1}L${n(cx - r2)} ${y2}A${n(r2)} ${n(r2 * K)} 0 0 0 ${n(cx + r2)} ${y2}` +
    `L${n(cx + r1)} ${y1}A${n(r1)} ${n(r1 * K)} 0 0 1 ${n(cx - r1)} ${y1}Z`
  );
}
const band = (v: V, y1: number, y2: number, fill: string, sw = 0, inset = 0) => P(bandD(v, y1, y2, inset), fill, sw);

function label(v: V, y1: number, y2: number, text: string, fill: string): El {
  const mid = (y1 + rAt(v, y1) * K + y2 + rAt(v, y2) * K) / 2;
  return {
    t: 'text',
    a: { x: v.cx, y: n(mid + 2.3), fontSize: 6.4, fontWeight: '800', fill, textAnchor: 'middle', letterSpacing: 0.5 },
    text,
  };
}
const decafBand = (v: V, y1: number, y2: number) => [band(v, y1, y2, DECAF, 1.5), label(v, y1, y2, 'DECAF', INK)];

const rim = (v: V, fill: string, sw = 2) => E(v.cx, v.top, v.rt, v.rt * K, fill, sw);
const surface = (v: V, fill: string, inset = 3, dy = 0.8, sw = 1.2) => {
  const rx = rAt(v, v.top + dy) - inset;
  return E(v.cx, v.top + dy, rx, rx * K, fill, sw);
};
/** Soft vertical highlight on the left of a vessel. */
const shine = (v: V, y1: number, y2: number, op = 0.5) =>
  L(`M${n(v.cx - rAt(v, y1) * 0.68)} ${y1}L${n(v.cx - rAt(v, y2) * 0.68)} ${y2}`, W, 3, { strokeOpacity: op });
const handle = (d: string, color: string, w = 5.5) => [L(d, INK, w + 4.5), L(d, color, w)];
const saucer = (cx: number, y: number, rx: number, fill = CERAMIC) => [
  E(cx, y, rx, rx * 0.25, fill),
  E(cx, y - 0.6, rx * 0.58, rx * 0.58 * 0.25, 'none', 1.2),
];
const steam = (xs: number[], y: number, h = 16) =>
  xs.map((x, i) => {
    const s = i % 2 ? -1 : 1;
    return L(`M${x} ${y}C${x - 5 * s} ${y - h * 0.35} ${x + 5 * s} ${y - h * 0.6} ${x} ${y - h}`, STEAM, 2.6);
  });
function heart(x: number, y: number, w: number, h: number, fill: string): El {
  return P(
    `M${x} ${n(y + h * 0.5)}C${n(x - w * 0.62)} ${n(y)} ${n(x - w * 0.42)} ${n(y - h * 0.62)} ${x} ${n(y - h * 0.22)}` +
      `C${n(x + w * 0.42)} ${n(y - h * 0.62)} ${n(x + w * 0.62)} ${n(y)} ${x} ${n(y + h * 0.5)}Z`,
    fill,
    0,
  );
}
function bean(x: number, y: number, deg: number, fill = '#5A321B'): El[] {
  const tf = { transform: `rotate(${deg} ${x} ${y})` };
  return [E(x, y, 4.2, 2.9, fill, 1.2, INK, tf), L(`M${x - 3.2} ${y}C${x - 1} ${y - 1.6} ${x + 1} ${y + 1.6} ${x + 3.2} ${y}`, '#C9925E', 0.9, tf)];
}
function cube(x: number, y: number, s: number, deg: number, fill = '#ECF7FB', sw = 1.4, edge = INK): El {
  const a = (deg * Math.PI) / 180;
  const pts = [0, 1, 2, 3].map((k) => {
    const t = a + Math.PI / 4 + (k * Math.PI) / 2;
    return `${n(x + (s / Math.SQRT2) * Math.cos(t))} ${n(y + (s / Math.SQRT2) * Math.sin(t))}`;
  });
  return P(`M${pts.join('L')}Z`, fill, sw, edge, { strokeLinejoin: 'round' });
}
const straw = (x1: number, y1: number, x2: number, y2: number, color: string) => [
  L(`M${x1} ${y1}L${x2} ${y2}`, INK, 7.5),
  L(`M${x1} ${y1}L${x2} ${y2}`, color, 4),
];
function leaf(x: number, y: number, len: number, deg: number, fill: string): El[] {
  const tf = { transform: `rotate(${deg} ${x} ${y})` };
  return [
    P(`M${x} ${y}C${x + len * 0.3} ${y - len * 0.42} ${x + len * 0.75} ${y - len * 0.38} ${x + len} ${y}C${x + len * 0.7} ${y + len * 0.36} ${x + len * 0.3} ${y + len * 0.36} ${x} ${y}Z`, fill, 1.4, INK, tf),
    L(`M${x + 1} ${y}L${x + len * 0.85} ${y}`, '#DCEFC2', 1, tf),
  ];
}
function mountains(cx: number, y: number, fill: string, snow = W): El[] {
  return [
    P(`M${cx - 14} ${y + 6}L${cx - 6} ${y - 5}L${cx - 1.5} ${y + 0.5}L${cx + 4} ${y - 8}L${cx + 14} ${y + 6}Z`, fill, 1.4),
    P(`M${cx + 4} ${y - 8}L${cx + 1.4} ${y - 4}L${cx + 3} ${y - 4.8}L${cx + 4.2} ${y - 3.6}L${cx + 5.4} ${y - 4.8}L${cx + 6.7} ${y - 3.9}Z`, snow, 0),
  ];
}

/** Chocolate (or glaze) running over the rim with a few drips down the front. */
function drips(v: V, depth: number, fill: string, drops: number[]): El {
  const { cx, top } = v;
  const r0 = v.rt;
  const y0 = top + depth;
  const r1 = rAt(v, y0);
  const yAt = (dx: number) => y0 + r1 * K * Math.sqrt(Math.max(0, 1 - (dx / r1) ** 2));
  let d = `M${n(cx - r0)} ${top}A${n(r0)} ${n(r0 * K)} 0 0 0 ${n(cx + r0)} ${top}L${n(cx + r1)} ${y0}`;
  const N = drops.length;
  for (let i = 0; i < N; i++) {
    const dx = r1 * (1 - (2 * (i + 0.5)) / N) * 0.88;
    for (let s = 1; s <= 3; s++) {
      const px = dx + 2.4 + ((r1 * 2) / N) * 0.88 * (0.5 - s / 6);
      if (Math.abs(px) < r1) d += `L${n(cx + px)} ${n(yAt(px))}`;
    }
    const yb = yAt(dx);
    d += `L${n(cx + dx + 2.2)} ${n(yb)}L${n(cx + dx + 2.2)} ${n(yb + drops[i])}A2.2 2.2 0 0 1 ${n(cx + dx - 2.2)} ${n(yb + drops[i])}L${n(cx + dx - 2.2)} ${n(yb)}`;
  }
  d += `L${n(cx - r1)} ${y0}Z`;
  return P(d, fill, 1.4);
}

// ---- scenes ----------------------------------------------------------------

/** Cup on a saucer with a handle on the right. */
function cupScene(v: V, cup: string, deco: El[], top: El[], extra: El[] = [], under: El[] = []): El[] {
  const h = v.bot - v.top;
  const x = v.cx + v.rt;
  const hd = `M${n(x - 3)} ${n(v.top + h * 0.16)}C${n(x + 13)} ${n(v.top + h * 0.08)} ${n(x + 12)} ${n(v.top + h * 0.66)} ${n(x - 6)} ${n(v.top + h * 0.7)}`;
  return [
    ...saucer(v.cx, v.bot + 3, v.rt + 13),
    ...under,
    ...handle(hd, cup, h < 30 ? 4 : 5.5),
    P(bodyD(v), cup),
    shine(v, v.top + 6, v.bot - 8),
    ...deco,
    rim(v, cup),
    ...top,
    ...extra,
  ];
}

/** Straight mug with a big handle. */
function mugScene(v: V, mug: string, deco: El[], top: El[], extra: El[] = [], handleColor = mug): El[] {
  const h = v.bot - v.top;
  const x = v.cx + v.rt - 2;
  const hd = `M${x} ${n(v.top + h * 0.2)}C${n(x + 21)} ${n(v.top + h * 0.15)} ${n(x + 21)} ${n(v.top + h * 0.74)} ${x} ${n(v.top + h * 0.72)}`;
  return [...handle(hd, handleColor, 6.5), P(bodyD(v), mug), shine(v, v.top + 7, v.bot - 10), ...deco, rim(v, mug), ...top, ...extra];
}

interface Layer {
  to: number;
  c: string;
}
/** Transparent vessel with liquid layers from `from` down to each layer's `to`. */
function glassScene(
  v: V,
  from: number,
  layers: Layer[],
  o: { tint?: string; top?: string; behind?: El[]; inside?: El[]; after?: El[]; inset?: number } = {},
): El[] {
  const inset = o.inset ?? 2.6;
  const out: El[] = [...(o.behind ?? []), P(bodyD(v), o.tint ?? GLASS)];
  let y = from;
  for (const l of layers) {
    out.push(band(v, y, l.to, l.c, 0, inset));
    y = l.to;
  }
  const rs = rAt(v, from) - inset;
  out.push(E(v.cx, from, rs, rs * K, o.top ?? layers[0].c, 1.2));
  out.push(...(o.inside ?? []));
  out.push(rim(v, 'none'), shine(v, v.top + 6, v.bot - 10, 0.75), ...(o.after ?? []));
  return out;
}

/** Takeaway paper cup with sleeve; lid optional (null = open, showing `open` surface). */
function paperCup(v: V, cup: string, sleeve: { y1: number; y2: number; c: string; deco?: El[] }, lid: string | null, open: El[] = []): El[] {
  const out: El[] = [P(bodyD(v), cup), shine(v, v.top + 6, sleeve.y1 - 4), band(v, sleeve.y1, sleeve.y2, sleeve.c, 1.6), ...(sleeve.deco ?? [])];
  const { cx, rt, top } = v;
  if (lid) {
    out.push(
      P(`M${cx - rt - 1} ${top - 3}L${cx - rt + 4} ${top - 10}L${cx + rt - 4} ${top - 10}L${cx + rt + 1} ${top - 3}Z`, lid),
      R(cx - rt - 3, top - 4, (rt + 3) * 2, 6.5, 3.2, lid),
      E(cx + 9, top - 8.6, 4.2, 1.2, INK, 0),
    );
  } else {
    out.push(rim(v, cup, 2.4), ...open);
  }
  return out;
}

/** Shallow tea bowl (chawan) with a foot ring. */
function chawan(cx: number, bowl: string, inner: string, deco: El[], top: El[]): El[] {
  const rt = 33;
  const t = 60;
  const b = 97;
  return [
    R(cx - 12, b - 4, 24, 9, 2.5, bowl),
    P(`M${cx - rt} ${t}C${cx - rt} ${t + 24} ${cx - 22} ${b} ${cx} ${b}C${cx + 22} ${b} ${cx + rt} ${t + 24} ${cx + rt} ${t}Z`, bowl),
    L(`M${cx - rt + 5} ${t + 7}C${cx - rt + 6} ${t + 16} ${cx - rt + 10} ${t + 23} ${cx - rt + 14} ${t + 27}`, W, 3, { strokeOpacity: 0.45 }),
    ...deco,
    E(cx, t, rt, rt * K, inner),
    ...top,
  ];
}
const whisk = (x: number): El[] => [
  R(x - 3, 50, 6, 28, 2, BAMBOO, 1.6),
  L(`M${x - 3} 63H${x + 3}`, '#A9844C', 1.2),
  P(`M${x - 6} 77C${x - 13} 86 ${x - 11} 101 ${x} 101C${x + 11} 101 ${x + 13} 86 ${x + 6} 77Z`, '#EAD3A2', 1.6),
  L(`M${x - 3} 81L${x - 6} 97M${x} 81V99M${x + 3} 81L${x + 6} 97`, '#B8955A', 1),
];

// ---- the drinks -------------------------------------------------------------

const CUP: V = { cx: 54, rt: 25, rb: 17, top: 58, bot: 94 };
const MUG: V = { cx: 52, rt: 22, rb: 22, top: 44, bot: 100 };
const TUMBLER: V = { cx: 60, rt: 24, rb: 18, top: 24, bot: 102 };
const BOWL: V = { cx: 60, rt: 37, rb: 21, top: 60, bot: 96 };
const GLASS_MUG: V = { cx: 52, rt: 22, rb: 22, top: 36, bot: 100 };
const PAPER: V = { cx: 60, rt: 24, rb: 17, top: 28, bot: 102 };

const bowlScene = (liquid: string, foam: string, deco: El[]): El[] => [
  R(BOWL.cx - 15, BOWL.bot - 3, 30, 8, 3, CERAMIC),
  P(bodyD(BOWL), CERAMIC),
  ...deco,
  rim(BOWL, CERAMIC),
  surface(BOWL, foam, 3.5),
  E(BOWL.cx + 2, BOWL.top + 1.4, 22, 4.4, liquid, 0),
  E(BOWL.cx - 9, BOWL.top + 0.6, 5, 1.2, foam, 0),
];
const stripes = (v: V, ys: number[], c: string) => ys.map((y) => band(v, y, y + 2.6, c));
const cupSurface = (v: V, coffee: string, glint = '#8A5A36') => [surface(v, coffee), E(v.cx - 8, v.top + 0.4, 6, 1.3, glint, 0)];

interface Spec extends DrinkPalette {
  art: () => El[];
}

const SPECS: Record<number, Spec> = {
  // Colombia Sierra Nevada — cream mug with a mountain + coffee-leaf motif
  20: {
    base: '#6B3E1F', accent: '#2E9A57', liquid: '#6B3E1F',
    art: () =>
      mugScene(MUG, '#F3E4C4', [...mountains(MUG.cx, 76, '#3C8C57'), ...leaf(MUG.cx - 3, 88, 9, -8, '#5FA049'), ...leaf(MUG.cx + 1, 88, 8, 200, '#4E9440')], cupSurface(MUG, '#6B3E1F')),
  },
  // Regular Blend — white cup with caramel stripes
  21: {
    base: '#6A3B1E', accent: '#B8743A', liquid: '#6A3B1E',
    art: () => cupScene(CUP, CERAMIC, stripes(CUP, [70, 76], '#C27C3E'), cupSurface(CUP, '#6A3B1E')),
  },
  // Regular Blend Decaffeinato — same cup, DECAF band
  22: {
    base: '#6A3B1E', accent: '#D46A1E', liquid: '#6A3B1E',
    art: () => cupScene(CUP, CERAMIC, decafBand(CUP, 68, 79), cupSurface(CUP, '#6A3B1E')),
  },
  // Roast Blend — brick mug with a flame, very dark roast
  23: {
    base: '#2F190D', accent: '#CC4A2C', liquid: '#33190C',
    art: () =>
      mugScene(MUG, '#B9472F', [
        P(`M52 90C44 90 43 81 48 75C48 79 51 80 51 76C51 72 54 69 57 67C56 72 61 75 60 82C61 79 62 78 62 76C64 80 62 90 52 90Z`, '#F6B93B', 1.4),
        P(`M52.5 88C49 88 48.5 84 51 81C51.5 83.5 53 83.5 53.5 81C55.5 83 57 85 55.5 87C55 87.8 54 88 52.5 88Z`, '#FBE7A1', 0),
      ], cupSurface(MUG, '#33190C', '#5A3420')),
  },
  // Iced Coffee Blend — tumbler, black coffee, ice, blue straw
  25: {
    base: '#3E2213', accent: '#2584C4', liquid: '#4A2A17',
    art: () =>
      glassScene(TUMBLER, 40, [{ to: 97, c: '#4A2A17' }], {
        tint: '#DCEFF8',
        top: '#5C3820',
        inside: [cube(52, 70, 10, 18, '#6E4C35', 1.2, '#2B1A10'), cube(66, 84, 9, -14, '#6E4C35', 1.2, '#2B1A10'), cube(50, 40, 12, 12), cube(66, 39, 11, -20), cube(59, 33, 10, 40)],
        after: straw(68, 38, 84, 6, '#2E8BC9'),
      }),
  },
  // Espresso Intenso — demitasse with crema, a bean on the saucer
  24: {
    base: '#2A160B', accent: '#C8303A', liquid: '#2E180C', foam: '#C98A4B',
    art: () => {
      const v: V = { cx: 56, rt: 16, rb: 11, top: 74, bot: 95 };
      return cupScene(v, CERAMIC, [band(v, 80, 83.5, '#C8303A')], [surface(v, '#3A1E0E', 2.4), E(v.cx, v.top + 1, 10.5, 2.3, '#C98A4B', 0), E(v.cx - 3, v.top + 0.6, 3.6, 0.9, '#E7B57E', 0)], [], bean(28, 100, -20));
    },
  },
  // Original Blend — short mint diner mug
  16: {
    base: '#55301A', accent: '#2F8F82', liquid: '#55301A',
    art: () => {
      const v: V = { cx: 52, rt: 25, rb: 22, top: 56, bot: 100 };
      return mugScene(v, '#7CC7B8', [band(v, 64, 68, W)], cupSurface(v, '#55301A'));
    },
  },
  // Mocha Blend — white cup with chocolate running over the rim and a drizzle on top
  17: {
    base: '#6E4128', accent: '#A0603A', liquid: '#6E4128',
    art: () =>
      cupScene(CUP, CERAMIC, [drips(CUP, 4, '#4A230F', [7, 12, 5, 10, 6])], [
        surface(CUP, '#7B4A2C'),
        L(`M38 59.5L44 57.5L48 61L53 57L58 61L63 57L67 60.5L71 58`, '#3A1A0B', 1.8),
      ]),
  },
  // Rich Blend — navy mug with gold bands
  12: {
    base: '#4A2915', accent: '#4F6FD0', liquid: '#4A2915',
    art: () => mugScene(MUG, '#3B5A9A', [band(MUG, 52, 55, '#E2B04A'), band(MUG, 88, 91, '#E2B04A')], cupSurface(MUG, '#4A2915', '#6E4429')),
  },
  // Americano Rich Aroma — tall mustard mug with aroma swirls
  1: {
    base: '#3C2213', accent: '#C2851A', liquid: '#3C2213',
    art: () => {
      const v: V = { cx: 52, rt: 19, rb: 19, top: 34, bot: 104 };
      return mugScene(v, '#E6AC3E', [band(v, 44, 46.5, '#B9822A')], cupSurface(v, '#3C2213', '#6A4429'), steam([44, 52, 60], 28, 22));
    },
  },
  // Café au Lait — French bowl with blue stripes
  13: {
    base: '#B98256', accent: '#B17846', liquid: '#C08A5E', foam: '#EBD3B5',
    art: () => bowlScene('#C08A5E', '#EBD3B5', stripes(BOWL, [69, 74.5], '#3C6FB6')),
  },
  // Café au Lait Decaffeinato — same bowl, DECAF band
  14: {
    base: '#B98256', accent: '#D46A1E', liquid: '#C08A5E', foam: '#EBD3B5',
    art: () => bowlScene('#C08A5E', '#EBD3B5', decafBand(BOWL, 67, 77)),
  },
  // Café au Lait Intenso — darker, red stripes
  15: {
    base: '#8E5733', accent: '#B5532E', liquid: '#8E5733', foam: '#E2C29E',
    art: () => bowlScene('#8E5733', '#E2C29E', [band(BOWL, 67, 72, '#C8443A'), band(BOWL, 75, 77, '#C8443A')]),
  },
  // Flat White — small slate cup, dark surface with a thin microfoam ring and a tiny heart
  6: {
    base: '#7A4A2B', accent: '#5E80A8', liquid: '#8A5634', foam: '#EAD8C0',
    art: () => {
      const v: V = { cx: 55, rt: 21, rb: 14, top: 66, bot: 95 };
      return cupScene(v, '#93AACA', [], [surface(v, '#EAD8C0', 2.6), E(v.cx, v.top + 1.1, 15.5, 3.3, '#7A4A2B', 0), heart(v.cx, v.top + 1, 7, 3.6, '#F6EBDD')]);
    },
  },
  // Café au Lait Rich Aroma — glass mug, tan coffee with foam, aroma swirls
  2: {
    base: '#C08E64', accent: '#BE7A42', liquid: '#C08E64', foam: '#F2E2CC',
    art: () =>
      glassScene(GLASS_MUG, 44, [{ to: 50, c: '#F2E2CC' }, { to: 95, c: '#C08E64' }], {
        top: '#F2E2CC',
        behind: handle(`M72 50C92 48 92 82 72 84`, GLASS, 6.5),
        after: steam([42, 52, 62], 30, 22),
      }),
  },
  // Cappuccino — teal cup with a foam dome and a cocoa heart
  9: {
    base: '#8A5633', accent: '#23918C', liquid: '#9C6A45', foam: FOAM,
    art: () =>
      cupScene(CUP, '#2F9C97', [], [E(CUP.cx, CUP.top - 2.4, 24, 8.4, FOAM, 2), E(CUP.cx, CUP.top - 3.2, 14, 4.4, '#B0764A', 0), heart(CUP.cx, CUP.top - 3.2, 10, 5.4, FOAM)]),
  },
  // Cappuccino Ice — tumbler, milky coffee, foam head, ice, coral straw
  19: {
    base: '#A8714A', accent: '#D84E54', liquid: '#AE774E', foam: FOAM,
    art: () =>
      glassScene(TUMBLER, 36, [{ to: 48, c: FOAM }, { to: 97, c: '#AE774E' }], {
        tint: '#DCEFF8',
        top: FOAM,
        inside: [cube(52, 64, 11, 15, '#D2A988', 1.2, '#7A4E30'), cube(68, 74, 10, -18, '#D2A988', 1.2, '#7A4E30'), cube(55, 86, 9, 30, '#D2A988', 1.2, '#7A4E30'), C(52, 35, 1.4, '#C9A27F'), C(62, 37, 1.1, '#C9A27F'), C(69, 34.5, 1.3, '#C9A27F')],
        after: straw(66, 34, 86, 5, '#E5484D'),
      }),
  },
  // Latte Macchiato — tall footed glass, milk / espresso / foam layers, long spoon
  10: {
    base: '#8C5631', accent: '#A9733F', liquid: '#C49A72', foam: '#FBF6EE',
    art: () => {
      const v: V = { cx: 58, rt: 17, rb: 14, top: 12, bot: 90 };
      return glassScene(v, 19, [{ to: 38, c: '#FBF6EE' }, { to: 52, c: '#8C5631' }, { to: 60, c: '#C49A72' }, { to: 85, c: '#F1E4D1' }], {
        behind: [E(58, 102, 16, 3.6, GLASS), R(54, 89, 8, 12, 1.5, GLASS)],
        inside: [L('M63 22L82 4', INK, 5), L('M63 22L82 4', '#C9CED6', 2.6)],
      });
    },
  },
  // Milk Tea — wide pale-blue teacup with a tea-bag tag
  5: {
    base: '#B8692A', accent: '#C55A44', liquid: '#C99568',
    art: () => {
      const v: V = { cx: 54, rt: 28, rb: 15, top: 66, bot: 95 };
      return cupScene(v, '#CFE3EE', [band(v, 70, 72.5, '#E58A7E')], [surface(v, '#C99568'), E(v.cx - 9, v.top + 0.4, 6, 1.3, '#DDB48D', 0)], [
        L('M36 67C33 72 31 76 31 81', '#E9E2D8', 1.2),
        R(25, 80, 12, 10, 1.5, '#D9493F', 1.5),
        R(28, 83, 6, 4, 0.8, W, 0),
      ]);
    },
  },
  // Tea Latte — straight glass, amber tea under milky tea and foam, tea tag
  31: {
    base: '#B8692A', accent: '#C2802A', liquid: '#C8955F', foam: FOAM,
    art: () => {
      const v: V = { cx: 58, rt: 21, rb: 20, top: 26, bot: 102 };
      return glassScene(v, 36, [{ to: 46, c: FOAM }, { to: 66, c: '#D9AE7E' }, { to: 97, c: '#B8692A' }], {
        top: FOAM,
        after: [L('M50 37C46 33 40 30 37 34C35 37 36 44 37 52', '#E9E2D8', 1.2), R(31, 51, 12, 10, 1.5, '#E3A43A', 1.5), R(34, 54, 6, 4, 0.8, W, 0)],
      });
    },
  },
  // Chococino — pink mug, whipped foam mound with cocoa dusting
  11: {
    base: '#6B3A22', accent: '#CF5A75', liquid: '#6B3A22', foam: '#F7EADB',
    art: () => {
      const v: V = { cx: 52, rt: 21, rb: 21, top: 54, bot: 102 };
      const { cx, rt, top } = v;
      const mound = P(
        `M${cx - rt + 1} ${top}C${cx - rt - 2} ${top - 8} ${cx - 11} ${top - 12} ${cx - 7} ${top - 10}C${cx - 6} ${top - 20} ${cx + 7} ${top - 21} ${cx + 8} ${top - 11}` +
          `C${cx + 14} ${top - 13} ${cx + rt + 2} ${top - 7} ${cx + rt - 1} ${top}A${rt - 1} ${n((rt - 1) * K)} 0 0 1 ${cx - rt + 1} ${top}Z`,
        '#F7EADB',
      );
      const dust = [[-10, -6], [-4, -9], [3, -13], [8, -7], [13, -4], [-14, -2], [-1, -4], [5, -2], [0, -16], [-7, -12], [11, -10], [-3, 1]].map(([dx, dy], i) => C(cx + dx, top + dy, i % 3 ? 1 : 1.4, '#7A4528'));
      return mugScene(v, '#EC9CB0', [band(v, 92, 95, '#C9667F')], [surface(v, '#6B3A22'), mound, ...dust]);
    },
  },
  // Green Tea Latte — glass mug, matcha under milk foam
  18: {
    base: '#7FAE4A', accent: '#5C9A33', liquid: '#8DBA58', foam: '#F3F3E6',
    art: () =>
      glassScene(GLASS_MUG, 42, [{ to: 54, c: '#F3F3E6' }, { to: 60, c: '#C4DC9A' }, { to: 95, c: '#7FAE4A' }], {
        top: '#F3F3E6',
        behind: handle(`M72 48C92 46 92 80 72 82`, GLASS, 6.5),
        inside: [heart(52, 42.4, 12, 5.4, '#9CC466')],
      }),
  },
  // Uji Matcha — beige chawan, bright jade matcha, whisk, painted leaf
  8: {
    base: '#86BC4E', accent: '#5E9C2E', liquid: '#86BC4E', foam: '#B5DB7C',
    art: () => [
      ...chawan(48, '#E8D4AE', '#D7C094', [...leaf(36, 80, 13, -25, '#6DA640')], [
        E(48, 61, 29.5, 6.1, '#86BC4E', 1.2),
        L('M33 61.5C38 58.5 52 58 58 60.5C62 62.2 57 64.5 50 63.8', '#B5DB7C', 1.6),
      ]),
      ...whisk(100),
    ],
  },
  // Koi Matcha — indigo chawan with glaze drips, deep thick matcha with fine foam, bamboo scoop
  7: {
    base: '#3F7A2A', accent: '#3C8A33', liquid: '#3F7A2A', foam: '#6EA444',
    art: () => {
      const v: V = { cx: 58, rt: 33, rb: 33, top: 60, bot: 97 };
      const bubbles = [[-14, 0], [-6, -1.5], [3, 1], [11, -0.8], [18, 0.6], [-19, 1.2], [7, 2.2], [-2, -2.2]].map(([dx, dy], i) => C(58 + dx, 61 + dy, i % 2 ? 0.9 : 1.3, '#A9D178'));
      return [
        ...chawan(58, '#36588F', '#2C4877', [drips(v, 5, '#A9BEDD', [6, 3, 9, 4, 7, 3])], [E(58, 61, 29.5, 6.1, '#3F7A2A', 1.2), E(58, 61, 24, 4.6, '#6EA444', 0), ...bubbles]),
        L('M24 54L104 70', INK, 5.5),
        L('M24 54L104 70', BAMBOO, 3),
        P('M100 67.5C104 66 108 68 107 71.5C106 73 102 72.5 100 71Z', BAMBOO, 1.4),
      ];
    },
  },
  // Starbucks House Blend — takeaway cup, kraft sleeve, bean motif
  26: {
    base: '#4A2915', accent: '#A86C3C', liquid: '#4A2915',
    art: () => paperCup(PAPER, CERAMIC, { y1: 52, y2: 80, c: '#C08A57', deco: [...bean(60, 68, -25, '#5A321B'), L('M38 56H82', '#A8733F', 0)] }, '#F2EEE8'),
  },
  // Starbucks Lightnote Blend — cream cup, sunny sleeve with a sun mark, light roast
  27: {
    base: '#8A5530', accent: '#B98316', liquid: '#8A5530',
    art: () =>
      paperCup(PAPER, '#FBF4E2', {
        y1: 52, y2: 80, c: '#F4C542',
        deco: [C(60, 68, 5, '#E9852B'), ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const t = (a * Math.PI) / 180;
          return L(`M${n(60 + 7.5 * Math.cos(t))} ${n(68 + 7.5 * Math.sin(t))}L${n(60 + 10 * Math.cos(t))} ${n(68 + 10 * Math.sin(t))}`, '#E9852B', 1.6);
        })],
      }, '#F7E7B8'),
  },
  // Starbucks Colombia — green sleeve with mountains
  28: {
    base: '#6B3E1F', accent: '#2F9460', liquid: '#6B3E1F',
    art: () => paperCup(PAPER, CERAMIC, { y1: 52, y2: 80, c: '#4E9A6B', deco: mountains(60, 68, '#2F6E48', '#F4F1EA') }, '#E4F0E8'),
  },
  // Starbucks Cappuccino — open takeaway cup, foam with a heart, terracotta sleeve
  30: {
    base: '#8A5633', accent: '#C9603C', liquid: '#9C6A45', foam: FOAM,
    art: () => {
      const v: V = { cx: 60, rt: 24, rb: 17, top: 34, bot: 102 };
      return paperCup(v, CERAMIC, { y1: 56, y2: 82, c: '#D06B47', deco: [L('M38 69.5H82', '#B4532F', 0)] }, null, [
        surface(v, FOAM, 2.6),
        E(v.cx, v.top + 1, 13, 2.9, '#B0764A', 0),
        heart(v.cx, v.top + 1, 9, 3.8, FOAM),
      ]);
    },
  },
  // Starbucks Latte Macchiato — clear takeaway cup with a dome lid, visible layers
  29: {
    base: '#8C5631', accent: '#A26E40', liquid: '#C49A72', foam: '#FBF6EE',
    art: () => {
      const v: V = { cx: 60, rt: 24, rb: 17, top: 40, bot: 102 };
      const dome = (r: number, h: number, fill: string, sw: number) => P(`M${60 - r} 40A${r} ${h} 0 0 1 ${60 + r} 40Z`, fill, sw);
      return [
        ...glassScene(v, 46, [{ to: 58, c: '#FBF6EE' }, { to: 70, c: '#8C5631' }, { to: 76, c: '#C49A72' }, { to: 98, c: '#F1E4D1' }], { top: '#FBF6EE' }),
        dome(26, 20, GLASS, 2),
        dome(21, 13, '#FBF6EE', 0),
        R(32, 37, 56, 6, 3, '#EEF6FA'),
        R(57, 17, 6, 4, 1.5, '#EEF6FA', 1.6),
        C(51, 32, 1.3, '#E3D3BD'), C(66, 30, 1.1, '#E3D3BD'),
      ];
    },
  },
};

const GENERIC: Spec = {
  base: '#6A3B1E', accent: '#B8743A', liquid: '#6A3B1E',
  art: () => cupScene(CUP, CERAMIC, [], cupSurface(CUP, '#6A3B1E')),
};

export const DRINK_IDS = Object.keys(SPECS).map(Number);

const cache = new Map<number, El[]>();
export function drinkShapes(capsuleId: number): El[] {
  let els = cache.get(capsuleId);
  if (!els) {
    els = (SPECS[capsuleId] ?? GENERIC).art();
    cache.set(capsuleId, els);
  }
  return els;
}

export function drinkPalette(capsuleId: number): DrinkPalette {
  const { base, accent, liquid, foam } = SPECS[capsuleId] ?? GENERIC;
  return foam ? { base, accent, liquid, foam } : { base, accent, liquid };
}

/** WCAG relative luminance of a #RRGGBB color. */
export function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function onAccent(capsuleId: number): '#000000' | '#FFFFFF' {
  const l = luminance(drinkPalette(capsuleId).accent);
  // contrast vs black (l+.05)/.05 against vs white 1.05/(l+.05)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#FFFFFF';
}
