import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { familyLabel, machineName, useMachine } from '../state/MachineProvider';
import { calibrationSummary, needsHotWaterSetup, useHotWaterCalibration } from '../state/hotWater';
import { AppIconPicker } from '../ui/icons/AppIconPicker';
import { BackIcon } from '../ui/Icons';
import { Button, IconButton, Press, Text } from '../ui/kit';
import { hairline, useTheme } from '../ui/theme';

export default function SettingsScreen() {
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const hotWater = useHotWaterCalibration(m.machine?.id);

  // disconnecting drops the machine, which sends the tabs back to the connect screen
  const run = (action: () => Promise<void>) => async () => {
    router.back();
    await action();
  };

  const rows: [string, string][] = [
    ['Machine', m.machine ? machineName(m.machine) : 'Not connected'],
    ['Model', m.machine ? familyLabel(m.machine) : '—'],
    ['Mode', m.kind === 'demo' ? 'Demo (simulated)' : 'Bluetooth'],
  ];

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 4, paddingBottom: insets.bottom + 24, gap: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconButton label="Back" onPress={() => router.back()}>
          <BackIcon color={t.fg} />
        </IconButton>
        <Text variant="title">Settings</Text>
      </View>

      <Section title="Machine">
        {rows.map(([k, v]) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 14,
              borderBottomWidth: hairline,
              borderBottomColor: t.hairline,
            }}>
            <Text muted>{k}</Text>
            <Text weight={500}>{v}</Text>
          </View>
        ))}
        {needsHotWaterSetup(m.machine) && (
          <Press
            haptic="selection"
            accessibilityLabel="Hot water setup"
            onPress={() => router.push('/hotwater-setup')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              borderBottomWidth: hairline,
              borderBottomColor: t.hairline,
            }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text muted>Hot water</Text>
              <Text variant="caption" muted>
                {hotWater.calibration ? calibrationSummary(hotWater.calibration) : 'Not set up yet'}
              </Text>
            </View>
            <Text weight={500}>{hotWater.calibration ? 'Recalibrate' : 'Set up'} ›</Text>
          </Press>
        )}
        {m.kind === 'demo' && (
          <Text variant="caption" muted style={{ paddingTop: 12 }}>
            Bluetooth isn't available in this build, so the app is simulating a machine. Install a development build to
            control a real one.
          </Text>
        )}
        <View style={{ gap: 12, paddingTop: 16 }}>
          <Button title="Disconnect" kind="secondary" disabled={!m.machine} onPress={run(m.disconnect)} />
          <Button title="Forget machine" kind="secondary" disabled={!m.lastMachine} onPress={run(m.forget)} />
        </View>
      </Section>

      <Section title="App Icon">
        <AppIconPicker />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" muted>
        {title}
      </Text>
      {children}
    </View>
  );
}
