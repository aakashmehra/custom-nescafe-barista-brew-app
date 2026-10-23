import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBaristaDrink } from '../../data/baristaMenu';
import { getCapsule } from '../../data/capsules';
import { baristaDefaults, displayName } from '../../data/drink';
import { baristaHowTo, howTo } from '../../data/howto';
import type { BaristaModel, HotWaterCalibration, MachineStatus } from '../../machine';
import { useHotWaterCalibration } from '../../state/hotWater';
import { useMachine } from '../../state/MachineProvider';
import { drinkPalette, onAccent } from '../../ui/art/palette';
import { baristaOnAccent, baristaPalette } from '../../ui/baristaArt';
import { Text } from '../../ui/kit';
import { hairline, useTheme } from '../../ui/theme';

export default function HowToSheet() {
  const params = useLocalSearchParams<{ id: string; strength?: string; water?: string; milk?: string }>();
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const hw = useHotWaterCalibration(m.machine?.id);
  const content = resolve(params, m.machine?.baristaModel, m.status?.coffee, hw.calibration);
  if (!content) return null;
  const { title, facts, steps, tips, accent: pal, ink } = content;
  const h = { steps, tips };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: insets.bottom + 24, gap: 22 }}>
      <View style={{ gap: 4 }}>
        <Text variant="label" muted>
          How to make
        </Text>
        <Text variant="title">{title}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {facts.map(([k, v]) => (
          <View key={k} style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: t.surface, gap: 4 }}>
            <Text variant="caption" muted>
              {k}
            </Text>
            <Text variant="headline" style={{ fontSize: 15 }}>
              {v}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 14 }}>
        {h.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: pal.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="caption" weight={700} style={{ color: ink }}>
                {i + 1}
              </Text>
            </View>
            <Text style={{ flex: 1, paddingTop: 2 }}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 8, paddingTop: 16, borderTopWidth: hairline, borderTopColor: t.hairline }}>
        {h.tips.map((tip) => (
          <Text key={tip} variant="caption" muted style={{ lineHeight: 18 }}>
            {tip}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

/** Dolce Gusto capsule (numeric id) or Barista drink (string id). */
function resolve(
  p: { id: string; strength?: string; water?: string; milk?: string },
  model: BaristaModel | undefined,
  coffee: MachineStatus['coffee'],
  hotWater: HotWaterCalibration | null,
) {
  const capsule = getCapsule(Number(p.id));
  if (capsule) {
    const h = howTo(capsule);
    const facts: [string, string][] = [
      ['Capsules', String(h.capsules)],
      [h.capsules === 2 ? 'Coffee / tea' : 'Water', `${h.drinkMl} ml · L${h.drinkLevel}`],
      ...(h.milkMl ? ([['Milk', `${h.milkMl} ml · L${h.milkLevel}`]] as [string, string][]) : []),
    ];
    return {
      title: displayName(capsule),
      facts,
      steps: h.steps,
      tips: h.tips,
      accent: drinkPalette(capsule.capsuleId),
      ink: onAccent(capsule.capsuleId),
    };
  }
  const d = getBaristaDrink(p.id);
  if (!d) return null;
  const def = baristaDefaults(d);
  const num = (v: string | undefined, fallback: number) => (v != null && !isNaN(Number(v)) ? Number(v) : fallback);
  const o = { strength: num(p.strength, def.strength), waterMl: num(p.water, def.waterMl), milkMl: d.options?.milkMl ? num(p.milk, def.milkMl) : 0 };
  const h = baristaHowTo(d, o, { model, coffee, hotWater });
  return { title: d.name, facts: h.facts, steps: h.steps, tips: h.tips, accent: baristaPalette(d.id), ink: baristaOnAccent(d.id) };
}
