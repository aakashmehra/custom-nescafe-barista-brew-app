import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCapsule } from '../data/capsules';
import { getBaristaDrink } from '../data/baristaMenu';
import { BARISTA_CUP_MAX_ML, CUP_MAX_ML, displayName, hasMilk, liquidKind, mlFor } from '../data/drink';
import { homeHref, useMachine } from '../state/MachineProvider';
import { baristaPalette } from '../ui/baristaArt';
import { Button, Pill, Text } from '../ui/kit';
import { Machine, type MachineLight } from '../ui/Machine';
import { drinkPalette } from '../ui/art/palette';
import { useTheme } from '../ui/theme';

const PHASE_TITLE = {
  sending: 'Starting',
  heating: 'Heating',
  brewing: 'Brewing',
  done: 'Enjoy',
  error: 'Brew stopped',
} as const;

export default function BrewingScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    level?: string;
    iced: string;
    cold: string;
    barista?: string;
    ml?: string;
  }>();
  const capsule = getCapsule(Number(params.id));
  const bdrink = getBaristaDrink(params.barista);
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const brew = m.brew;
  const phase = brew?.phase ?? 'sending';
  const iced = params.iced === '1';
  const ml = capsule ? mlFor(capsule, Number(params.level)) : Number(params.ml) || 120;
  const pal = bdrink ? baristaPalette(bdrink.id) : capsule ? drinkPalette(capsule.capsuleId) : null;
  const cupMax = bdrink ? BARISTA_CUP_MAX_ML : CUP_MAX_ML;
  const done = phase === 'done';
  const fill = done ? 1 : phase === 'brewing' || phase === 'error' ? (brew?.progress ?? 0) : 0;

  // Esperta (figaro), Barista Duo and Barista W hot water (rinse cycles) can be stopped over Bluetooth.
  const mach = m.machine;
  const canAbort =
    m.kind === 'demo' ||
    mach?.family === 'figaro' ||
    (mach?.family === 'barista' && (mach.baristaModel === 'duo' || (mach.baristaModel === 'w' && bdrink?.id === 'hotWater')));
  const noAbort = !canAbort;
  const light: MachineLight = phase === 'sending' || phase === 'heating' ? 'pulse' : phase === 'error' ? 'off' : 'on';

  const leave = () => {
    m.clearBrew();
    if (router.canDismiss()) router.dismissAll();
    else router.replace(homeHref(m.machine));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {capsule ? displayName(capsule) : (bdrink?.name ?? 'Your drink')} · {ml} ml
        </Text>
        {m.kind === 'demo' && <Pill label="Demo" />}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Machine
          width={240}
          light={light}
          capsule={!bdrink}
          dripping={phase === 'brewing'}
          cup={{
            level: (fill * ml) / cupMax,
            kind: capsule ? liquidKind(capsule) : 'coffee',
            liquid: pal?.liquid,
            foam: pal?.foam,
            milk: capsule ? hasMilk(capsule) : bdrink?.id === 'cappuccino' || bdrink?.id === 'latte',
            hot: params.cold !== '1',
            iced,
          }}
        />
      </View>

      <View style={{ gap: 20 }}>
        <Animated.View key={phase} entering={FadeIn.duration(300)} style={{ gap: 6 }}>
          <Text variant="display">{PHASE_TITLE[phase]}</Text>
          <Text muted>
            {phase === 'error'
              ? (brew?.message ?? 'Something went wrong.')
              : done
                ? 'Your drink is ready.'
                : (brew?.message ?? (phase === 'brewing' ? `${Math.round(fill * 100)}%` : 'Getting the machine ready…'))}
          </Text>
        </Animated.View>

        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.hairline, overflow: 'hidden' }}>
          <Animated.View
            style={{ height: 4, backgroundColor: t.fg, width: `${fill * 100}%`, transitionProperty: 'width', transitionDuration: 200 }}
          />
        </View>

        {done || phase === 'error' ? (
          <Button title={done ? 'Back to menu' : 'Back'} onPress={leave} />
        ) : noAbort ? (
          <Text variant="caption" muted style={{ textAlign: 'center', paddingVertical: 18 }}>
            To stop early, press the button on the machine.
          </Text>
        ) : (
          <Button
            title={bdrink?.id === 'hotWater' ? 'Stop' : 'Cancel'}
            kind="secondary"
            onPress={async () => {
              await m.abort();
              leave();
            }}
          />
        )}
      </View>
    </View>
  );
}
