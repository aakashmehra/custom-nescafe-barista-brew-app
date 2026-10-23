import { useEffect, useId } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const TAU = Math.PI * 2;

// Flat illustration colors, matching src/ui/art. Fixed (not themed) so the cup reads on black and white.
const INK = '#2A1F1A';
const CERAMIC = '#F4EFE6';
const GLASS = '#E3F1F7';
const STEAM = '#A89F97';
const ICE = '#CDE9F6';
const ICE_EDGE = '#8DBFD6';
const FALLBACK = { coffee: '#6B4226', tea: '#C98A3D', cocoa: '#5A3420', milk: '#F8F0E4' };

// Two silhouettes on a 200x240 canvas: a mug for hot drinks, a tall glass for iced.
const SHAPES = {
  mug: {
    body: 'M36 60 L164 60 L152 200 Q151 214 137 214 L63 214 Q49 214 48 200 Z',
    top: 70,
    bottom: 214,
  },
  glass: {
    body: 'M46 36 L154 36 L143 206 Q142 216 131 216 L69 216 Q58 216 57 206 Z',
    top: 48,
    bottom: 216,
  },
};

/** A looping 0..2π clock, frozen when reduced motion is on. */
export function useClock(durationMs: number) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = 0;
    t.value = withRepeat(withTiming(TAU, { duration: durationMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, durationMs, t]);
  return t;
}

export type LiquidKind = 'coffee' | 'tea' | 'cocoa';

export function Cup({
  level,
  kind = 'coffee',
  milk = false,
  hot = true,
  iced = false,
  size = 200,
  liquid,
  foam,
}: {
  /** override liquid / milk colors (per-drink palette) */
  liquid?: string;
  foam?: string;
  /** 0..1 of the cup's capacity */
  level: number;
  kind?: LiquidKind;
  milk?: boolean;
  hot?: boolean;
  iced?: boolean;
  size?: number;
}) {
  const shape = iced ? SHAPES.glass : SHAPES.mug;
  const lv = useSharedValue(level);
  const clock = useClock(2600);
  const clipId = 'cup' + useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    lv.value = withTiming(Math.max(0, Math.min(1, level)), {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [level, lv]);

  const { top, bottom } = shape;
  const liquidColor = liquid ?? FALLBACK[kind];

  const liquidProps = useAnimatedProps(() => ({
    d: wave(top, bottom, lv.value, clock.value, 0),
  }));
  const foamProps = useAnimatedProps(() => ({
    d: milk ? wave(top, bottom, lv.value, clock.value, Math.min(26, lv.value * (bottom - top) * 0.32)) : 'M0 0',
  }));

  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 200 240">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={shape.body} />
        </ClipPath>
      </Defs>
      {hot && !iced && <Steam clock={clock} level={lv} color={STEAM} />}
      {!iced && (
        <>
          <Rect x={18} y={216} width={164} height={12} rx={6} fill={CERAMIC} stroke={INK} strokeWidth={2.5} />
          <Path d="M158 90 C198 90 198 166 152 168" stroke={INK} strokeWidth={17} strokeLinecap="round" fill="none" />
          <Path d="M158 90 C198 90 198 166 152 168" stroke={CERAMIC} strokeWidth={12} strokeLinecap="round" fill="none" />
        </>
      )}
      <Path d={shape.body} fill={iced ? GLASS : CERAMIC} />
      <G clipPath={`url(#${clipId})`}>
        <AnimatedPath animatedProps={liquidProps} fill={liquidColor} />
        {milk && <AnimatedPath animatedProps={foamProps} fill={foam ?? FALLBACK.milk} />}
        {iced && [0, 1, 2].map((i) => <Ice key={i} i={i} clock={clock} level={lv} top={top} bottom={bottom} />)}
      </G>
      <Path d={shape.body} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Liquid body with a sine surface. `band` > 0 draws only a band of that thickness under the surface (foam). */
function wave(top: number, bottom: number, level: number, phase: number, band: number) {
  'worklet';
  if (level < 0.004) return 'M0 0';
  const surface = bottom - level * (bottom - top);
  const amp = Math.min(3.2, level * 30);
  const floor = band > 0 ? surface + band : bottom + 4;
  let d = `M0 ${floor}`;
  for (let x = 0; x <= 200; x += 10) {
    d += ` L${x} ${surface + amp * Math.sin((x / 200) * TAU * 1.3 + phase)}`;
  }
  return `${d} L200 ${floor} Z`;
}

function Steam({ clock, level, color }: { clock: SharedValue<number>; level: SharedValue<number>; color: string }) {
  return (
    <>
      {[78, 100, 122].map((cx, i) => (
        <Wisp key={cx} cx={cx} i={i} clock={clock} level={level} color={color} />
      ))}
    </>
  );
}

function Wisp({
  cx,
  i,
  clock,
  level,
  color,
}: {
  cx: number;
  i: number;
  clock: SharedValue<number>;
  level: SharedValue<number>;
  color: string;
}) {
  const props = useAnimatedProps(() => {
    const p = clock.value;
    let d = '';
    for (let y = 50; y >= 6; y -= 4) {
      const x = cx + 5 * Math.sin(y / 9 + p * 2 + i * 1.7) * ((50 - y) / 44 + 0.3);
      d += `${d ? ' L' : 'M'}${x} ${y}`;
    }
    // steam only appears once there's something hot in the cup
    const visible = Math.min(1, level.value * 6);
    return { d, opacity: visible * (0.35 + 0.25 * Math.sin(p + i * 2.1)) };
  });
  return <AnimatedPath animatedProps={props} stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />;
}

function Ice({
  i,
  clock,
  level,
  top,
  bottom,
}: {
  i: number;
  clock: SharedValue<number>;
  level: SharedValue<number>;
  top: number;
  bottom: number;
}) {
  const props = useAnimatedProps(() => {
    const surface = bottom - Math.max(level.value, 0.18) * (bottom - top);
    const cx = 78 + i * 24;
    const cy = surface + 8 + i * 9 + 2.5 * Math.sin(clock.value + i * 2);
    const s = 13;
    const a = 0.35 * (i - 1) + 0.08 * Math.sin(clock.value + i);
    const pts = [0, 1, 2, 3].map((k) => {
      const ang = a + Math.PI / 4 + (k * Math.PI) / 2;
      return `${cx + s * Math.SQRT2 * Math.cos(ang)} ${cy + s * Math.SQRT2 * Math.sin(ang)}`;
    });
    return { d: `M${pts[0]} L${pts[1]} L${pts[2]} L${pts[3]} Z` };
  });
  return (
    <AnimatedPath animatedProps={props} fill={ICE} stroke={ICE_EDGE} strokeWidth={2} strokeLinejoin="round" />
  );
}
