import { useEffect, useRef, type ComponentProps } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Shapes } from './art/DrinkArt';
import {
  LIGHT,
  M,
  capsuleColor,
  capsuleD,
  dropD,
  leverD,
  machineBack,
  machineBody,
  machineFront,
  streamColor,
  streamD,
} from './art/machineShapes';
import { Cup, useClock } from './Cup';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const TAU = Math.PI * 2;
const ease = Easing.inOut(Easing.cubic);

export type MachineLight = 'off' | 'pulse' | 'on';

// Colored capsule machine on a 240x300 canvas: water tank at the back, head with a lever-operated
// capsule slot, spout, status light, drip tray. All motion is timing-based (no springs).
export function Machine({
  width = 240,
  light = 'off',
  capsule = false,
  dripping = false,
  cup = null,
}: {
  width?: number;
  light?: MachineLight;
  /** flip to true to drop a capsule into the slot */
  capsule?: boolean;
  dripping?: boolean;
  /** cup slides under the spout when set */
  cup?: Omit<ComponentProps<typeof Cup>, 'size'> | null;
}) {
  const k = width / 240;
  const reduced = useReducedMotion();
  const clock = useClock(1000);
  const liquid = cup?.liquid ?? streamColor(cup?.kind, cup?.milk);

  // status light: gentle pulse while connecting/heating
  const glow = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(glow);
    if (light === 'pulse' && !reduced) {
      glow.value = 1;
      glow.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      glow.value = withTiming(1, { duration: 250 });
    }
  }, [light, reduced, glow]);
  const ledProps = useAnimatedProps(() => ({ opacity: glow.value }));
  const haloProps = useAnimatedProps(() => ({ opacity: glow.value * 0.45 }));

  // capsule load: 0→1 lever up, 1→2 capsule slides into the slot, 2→3 lever down
  const seq = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(seq);
    if (!capsule) {
      seq.value = 0;
    } else if (reduced) {
      seq.value = 3;
    } else {
      seq.value = 0;
      seq.value = withSequence(
        withTiming(1, { duration: 380, easing: ease }),
        withTiming(2, { duration: 800, easing: ease }),
        withDelay(120, withTiming(3, { duration: 480, easing: ease })),
      );
    }
  }, [capsule, reduced, seq]);
  const leverAngle = () => {
    'worklet';
    const s = seq.value;
    return M.leverUp * (s <= 1 ? s : s <= 2 ? 1 : 3 - s);
  };
  const armProps = useAnimatedProps(() => ({ d: leverD(leverAngle()).arm }));
  const knobProps = useAnimatedProps(() => ({ d: leverD(leverAngle()).knob }));
  const capsuleY = () => {
    'worklet';
    const s = seq.value;
    return M.capsuleFrom + (M.capsuleTo - M.capsuleFrom) * Math.min(Math.max(s - 1, 0), 1);
  };
  const capsuleOpacity = () => {
    'worklet';
    const s = seq.value;
    return s <= 0 || s >= 2 ? 0 : Math.min(s * 1.5, 1);
  };
  const capBodyProps = useAnimatedProps(() => ({ d: capsuleD(capsuleY()).body, opacity: capsuleOpacity() }));
  const capLidProps = useAnimatedProps(() => ({ d: capsuleD(capsuleY()).lid, opacity: capsuleOpacity() }));

  // stream from the spout while brewing; dashes travel downward
  const flow = useSharedValue(dripping ? 1 : 0);
  useEffect(() => {
    flow.value = withTiming(dripping ? 1 : 0, { duration: 300, easing: ease });
  }, [dripping, flow]);
  const streamProps = useAnimatedProps(() => ({ opacity: flow.value, strokeWidth: 1.5 + 4 * flow.value }));
  const glintProps = useAnimatedProps(() => ({
    opacity: flow.value * 0.45,
    strokeDashoffset: -(clock.value / TAU) * 36,
  }));

  // last drips after the stream stops
  const tail = useSharedValue(0);
  const wasDripping = useRef(dripping);
  useEffect(() => {
    if (wasDripping.current && !dripping && !reduced) {
      tail.value = 1;
      tail.value = withTiming(0, { duration: 2800, easing: Easing.linear });
    }
    wasDripping.current = dripping;
  }, [dripping, reduced, tail]);
  const dropProps = useAnimatedProps(() => {
    const p = clock.value / TAU;
    return { d: dropD(p * p), opacity: Math.min(1, tail.value * 3) };
  });

  // cup slide-in
  const slide = useSharedValue(0);
  const hasCup = cup != null;
  useEffect(() => {
    slide.value = withTiming(hasCup ? 1 : 0, { duration: reduced ? 0 : 550, easing: Easing.out(Easing.cubic) });
  }, [hasCup, reduced, slide]);
  const cupStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateX: (1 - slide.value) * -60 * k }],
  }));

  return (
    <View style={{ width, height: width * 1.25 }}>
      <Svg width={width} height={width * 1.25} viewBox="0 0 240 300">
        <Shapes els={machineBack} />
        <AnimatedPath animatedProps={capBodyProps} fill={capsuleColor(cup?.kind)} stroke={M.ink} strokeWidth={2} strokeLinejoin="round" />
        <AnimatedPath animatedProps={capLidProps} fill={M.chrome} stroke={M.ink} strokeWidth={2} strokeLinejoin="round" />
        <Shapes els={machineBody} />
        <AnimatedPath animatedProps={armProps} stroke={M.ink} strokeWidth={12} strokeLinecap="round" fill="none" />
        <AnimatedPath animatedProps={armProps} stroke={M.chrome} strokeWidth={7} strokeLinecap="round" fill="none" />
        <AnimatedPath animatedProps={knobProps} fill="#3A3230" stroke={M.ink} strokeWidth={2.4} />
        <Shapes els={machineFront} />
        {light !== 'off' && (
          <AnimatedCircle animatedProps={haloProps} cx={169} cy={132} r={9} fill="none" stroke={LIGHT[light]} strokeWidth={2} />
        )}
        <AnimatedCircle animatedProps={ledProps} cx={169} cy={132} r={5.5} fill={LIGHT[light]} />
        <AnimatedPath animatedProps={streamProps} d={streamD} stroke={liquid} strokeLinecap="round" />
        <AnimatedPath animatedProps={glintProps} d={streamD} stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" strokeDasharray="6 12" />
        <AnimatedPath animatedProps={dropProps} fill={liquid} />
      </Svg>

      {cup && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: (M.spoutX - M.cupSize / 2) * k, top: M.cupTop * k }, cupStyle]}>
          <Cup {...cup} size={M.cupSize * k} />
        </Animated.View>
      )}
    </View>
  );
}
