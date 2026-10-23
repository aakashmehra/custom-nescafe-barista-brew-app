import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clamp } from '../data/drink';
import type { HotWaterCalibration, RinseStopMethod } from '../machine';
import { useMachine } from '../state/MachineProvider';
import { calibrationSummary, useHotWaterCalibration } from '../state/hotWater';
import { baristaPalette } from '../ui/baristaArt';
import { StepperRow } from '../ui/DrinkParts';
import { BackIcon } from '../ui/Icons';
import { Button, IconButton, Text } from '../ui/kit';
import { Machine } from '../ui/Machine';
import { useTheme } from '../ui/theme';

type Step = 'measure' | 'amount' | 'stop' | 'done';
const TEST_STOP_MS = 2000;
const ML = { min: 20, max: 300, step: 5, default: 100 };

// Barista W hot-water calibration: time + measure one rinse, then check whether a rinse can be cut short.
export default function HotWaterSetup() {
  const m = useMachine();
  const hw = useHotWaterCalibration(m.machine?.id);
  if (!m.machine || !hw.loaded) return null;
  return <Wizard initial={hw.calibration} save={hw.save} />;
}

function Wizard({
  initial,
  save,
}: {
  initial: HotWaterCalibration | null;
  save: (cal: HotWaterCalibration) => Promise<void>;
}) {
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const water = baristaPalette('hotWater');
  const [step, setStep] = useState<Step>(initial ? 'done' : 'measure');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rinseMs, setRinseMs] = useState(initial?.rinseMs ?? 0);
  const [rinseMl, setRinseMl] = useState(initial?.rinseMl ?? ML.default);
  const [stop, setStop] = useState<RinseStopMethod>(initial?.stop ?? 'none');
  const [artH, setArtH] = useState(0);

  const run = async (
    stopAfterMs: number | null,
    then: (r: { extractMs: number; stop?: RinseStopMethod }) => void | Promise<void>,
  ) => {
    setError(null);
    setRunning(true);
    try {
      await then(await m.rinseTest(stopAfterMs));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRunning(false);
    }
  };

  const progress = running ? (m.rinse?.progress ?? 0) : 0;
  const cupLevel = running ? progress * 0.5 : step === 'amount' ? rinseMl / 300 : 0;
  const stepNo = step === 'measure' || step === 'amount' ? 1 : step === 'stop' ? 2 : null;

  const copy = {
    measure: {
      title: 'Measure a rinse',
      body: 'Put a measuring cup under the spout. The Barista runs one rinse so Brew can time it.',
    },
    amount: { title: 'How much water came out?', body: 'Read the measuring cup and set the amount.' },
    stop: {
      title: 'Test stopping early',
      body: 'Empty the cup and put it back. Brew starts a rinse and tries to stop it after 2 seconds.',
    },
    done: {
      title: 'Hot water is ready',
      body:
        stop === 'none'
          ? `Your Barista can’t stop a rinse early, so amounts are rounded to ${rinseMl} ml steps.`
          : 'Your Barista can stop early, so any amount works.',
    },
  }[step];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        paddingTop: insets.top + 4,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 20,
        gap: 16,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon color={t.fg} />
        </IconButton>
        <Text variant="caption" muted style={{ flex: 1 }}>
          Hot water setup{stepNo ? ` · Step ${stepNo} of 2` : ''}
        </Text>
      </View>

      <Animated.View key={step} entering={FadeIn.duration(250)} style={{ gap: 8 }}>
        <Text variant="title">{copy.title}</Text>
        <Text muted>{copy.body}</Text>
      </Animated.View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => setArtH(e.nativeEvent.layout.height)}>
        {artH > 0 && (
          <Machine
            width={Math.min(240, artH / 1.25)}
            light={running ? 'pulse' : 'on'}
            dripping={running}
            cup={{ level: cupLevel, kind: 'coffee', liquid: water.liquid, hot: true }}
          />
        )}
      </View>

      <View style={{ gap: 12 }}>
        {running && (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.hairline, overflow: 'hidden' }}>
            <View style={{ height: 4, width: `${Math.min(1, progress) * 100}%`, backgroundColor: water.accent }} />
          </View>
        )}
        {error && (
          <Text variant="caption" style={{ color: '#FF453A' }}>
            {error}
          </Text>
        )}

        {step === 'amount' && (
          <StepperRow
            label="Water from one rinse"
            value={`${rinseMl} ml`}
            canMinus={rinseMl > ML.min}
            canPlus={rinseMl < ML.max}
            onMinus={() => setRinseMl((v) => clamp(v - ML.step, ML.min, ML.max))}
            onPlus={() => setRinseMl((v) => clamp(v + ML.step, ML.min, ML.max))}
          />
        )}

        {step === 'done' && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: t.surface, gap: 4 }}>
            <Text weight={500}>{calibrationSummary({ rinseMl, rinseMs, stop })}</Text>
            <Text variant="caption" muted>
              One rinse takes about {(rinseMs / 1000).toFixed(1)} s. Recalibrate any time from Settings.
            </Text>
          </View>
        )}

        {step === 'measure' && (
          <Button
            title={error ? 'Try again' : 'Run rinse'}
            loading={running}
            disabled={m.connection !== 'ready' && !running}
            onPress={() =>
              run(null, (r) => {
                setRinseMs(r.extractMs);
                setStep('amount');
              })
            }
          />
        )}
        {step === 'amount' && (
          <Button
            title="Save and continue"
            onPress={() => {
              Haptics.selectionAsync();
              setStep('stop');
            }}
          />
        )}
        {step === 'stop' && (
          <Button
            title={error ? 'Try again' : 'Run test'}
            loading={running}
            disabled={m.connection !== 'ready' && !running}
            onPress={() =>
              run(TEST_STOP_MS, async (r) => {
                const s = r.stop ?? 'none';
                setStop(s);
                await save({ rinseMl, rinseMs, stop: s });
                setStep('done');
              })
            }
          />
        )}
        {step === 'done' && (
          <View style={{ gap: 12 }}>
            <Button title="Done" onPress={() => router.back()} />
            <Button title="Recalibrate" kind="secondary" onPress={() => setStep('measure')} />
          </View>
        )}
      </View>
    </View>
  );
}
