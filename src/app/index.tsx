import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DiscoveredMachine } from '../machine';
import { familyLabel, homeHref, machineName, useMachine, type MachineError } from '../state/MachineProvider';
import { Button, Glass, Pill, Press, Text } from '../ui/kit';
import { Machine } from '../ui/Machine';
import { hairline, useTheme } from '../ui/theme';

export default function ConnectScreen() {
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  if (m.machine) return <Redirect href={homeHref(m.machine)} />;

  const scanning = m.connection === 'scanning';
  const busy = scanning || m.connectingId != null;
  const reconnecting = m.restoring && m.connectingId != null && m.lastMachine != null;

  let title = 'Connect your machine';
  let subtitle = 'Turn it on and keep your phone close.';
  if (reconnecting) {
    title = 'Reconnecting';
    subtitle = `Finding ${machineName(m.lastMachine!)}…`;
  } else if (m.connectingId) {
    title = 'Connecting';
    subtitle = 'Hang tight, this takes a moment.';
  } else if (scanning) {
    title = m.machines.length ? 'Machines nearby' : 'Looking for machines';
    subtitle = m.machines.length ? 'Tap yours to connect.' : 'Searching over Bluetooth…';
  } else if (m.error) {
    title = m.error.title;
    subtitle = m.error.message;
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
        <Text variant="headline" weight={700}>
          Custom Nescafe Barista Brew App
        </Text>
        {m.kind === 'demo' && <Pill label="Demo" />}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, gap: 28 }}>
        <View style={{ alignItems: 'center' }}>
          <Machine width={200} light={busy || m.pairingPrompt ? 'pulse' : 'off'} />
        </View>

        <Animated.View key={title} entering={FadeIn.duration(250)} style={{ gap: 8 }}>
          <Text variant="title">{title}</Text>
          <Text muted>{subtitle}</Text>
        </Animated.View>

        {m.machines.length > 0 && !reconnecting && (
          <View style={{ gap: 10 }}>
            {m.machines.map((d) => (
              <Animated.View key={d.id} entering={FadeIn.duration(220)}>
                <MachineRow
                  machine={d}
                  connecting={m.connectingId === d.id}
                  disabled={m.connectingId != null}
                  onPress={() => m.connect(d)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, gap: 12 }}>
        {reconnecting ? (
          <Button title="Cancel" kind="secondary" onPress={m.cancelConnect} />
        ) : scanning ? (
          <Button title="Stop" kind="secondary" onPress={m.stopScan} />
        ) : (
          <Button
            title={m.error ? 'Try again' : 'Connect'}
            disabled={m.connectingId != null}
            onPress={() => {
              if (m.error?.kind === 'connectionLost' && m.lastMachine) m.connect(m.lastMachine);
              else if (m.error && m.error.kind !== 'notFound' && m.retryTarget) m.retry();
              else m.scan();
            }}
          />
        )}
      </View>

      <PairingSheet
        message={m.pairingPrompt?.message}
        failure={m.pairError}
        onRetry={m.retry}
        onCancel={() => {
          m.clearError();
          m.cancelConnect();
        }}
      />
    </View>
  );
}

function MachineRow({
  machine,
  connecting,
  disabled,
  onPress,
}: {
  machine: DiscoveredMachine;
  connecting: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Press onPress={onPress} disabled={disabled && !connecting} accessibilityLabel={`Connect to ${machineName(machine)}`}>
      <Glass radius={20} interactive style={{ flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{machineName(machine)}</Text>
          <Text variant="caption" muted>
            {machine.family === 'barista' ? 'Nescafé Barista' : `Dolce Gusto ${familyLabel(machine)}`} · {signalLabel(machine.rssi)}
          </Text>
        </View>
        {connecting ? <ActivityIndicator /> : <SignalBars rssi={machine.rssi} />}
      </Glass>
    </Press>
  );
}

const bars = (rssi: number | null) => (rssi == null ? 0 : rssi > -60 ? 4 : rssi > -70 ? 3 : rssi > -80 ? 2 : 1);
const signalLabel = (rssi: number | null) => ['Unknown signal', 'Weak signal', 'Fair signal', 'Good signal', 'Strong signal'][bars(rssi)];

function SignalBars({ rssi }: { rssi: number | null }) {
  const t = useTheme();
  const n = bars(rssi);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 16 }} accessibilityLabel={signalLabel(rssi)}>
      {[1, 2, 3, 4].map((b) => (
        <View key={b} style={{ width: 4, height: 4 + b * 3, borderRadius: 2, backgroundColor: b <= n ? t.fg : t.hairline }} />
      ))}
    </View>
  );
}

const PAIR_WINDOW_S = 20;

function PairingSheet({
  message,
  failure,
  onRetry,
  onCancel,
}: {
  message?: string;
  failure: MachineError | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Note: prompts ending in "…" are transitional, the rest are user actions inside the 20 s window
  const timed = message != null && !message.endsWith('…');
  const [left, setLeft] = useState(PAIR_WINDOW_S);
  const [step, setStep] = useState(0);

  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!timed) return;
    if (seen.current !== message) setStep((n) => n + 1);
    seen.current = message;
    const start = Date.now();
    setLeft(PAIR_WINDOW_S);
    const id = setInterval(() => setLeft(Math.max(0, PAIR_WINDOW_S - (Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, [message, timed]);

  useEffect(() => {
    if (message == null && !failure) {
      setStep(0);
      seen.current = undefined;
    }
  }, [message, failure]);

  return (
    <Modal visible={message != null || failure != null} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Glass radius={32} style={{ padding: 28, gap: 18 }}>
          {failure ? (
            <>
              <Text variant="label" muted>
                Pairing
              </Text>
              <Text variant="title">{failure.title}</Text>
              <Text muted>{failure.message}</Text>
              <View style={{ gap: 12 }}>
                <Button title="Retry" onPress={onRetry} />
                <Button title="Cancel" kind="secondary" onPress={onCancel} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator />
                <Text variant="label" muted style={{ flex: 1 }}>
                  Pairing{step > 0 ? ` · Step ${step}` : ''}
                </Text>
                {timed && (
                  <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
                    {Math.ceil(left)}s
                  </Text>
                )}
              </View>
              <Animated.View key={message} entering={FadeIn.duration(250)}>
                <Text variant="title">{message}</Text>
              </Animated.View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: t.hairline, overflow: 'hidden' }}>
                {timed && (
                  <View
                    style={{
                      height: 4,
                      width: `${(left / PAIR_WINDOW_S) * 100}%`,
                      backgroundColor: t.fg,
                    }}
                  />
                )}
              </View>
              <Text muted>Keep your phone near the machine. You only need to do this once.</Text>
              <View style={{ height: hairline, backgroundColor: t.hairline }} />
              <Button title="Cancel" kind="secondary" onPress={onCancel} />
            </>
          )}
        </Glass>
      </View>
    </Modal>
  );
}
