import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BARISTA_MODEL_NAMES, getBaristaDrink } from '../../data/baristaMenu';
import {
  BARISTA_CUP_MAX_ML,
  baristaCustomizable,
  baristaDefaults,
  baristaWaterRange,
  clamp,
} from '../../data/drink';
import { HOT_WATER_MIN_ML, planHotWater } from '../../machine/protocol/barista';
import { useMachine } from '../../state/MachineProvider';
import { useHotWaterCalibration } from '../../state/hotWater';
import { useFavorites } from '../../state/favorites';
import { BaristaArt, baristaOnAccent, baristaPalette } from '../../ui/baristaArt';
import { Cup } from '../../ui/Cup';
import { DrinkTopBar, NameSheet, StepperRow } from '../../ui/DrinkParts';
import { Button, Glass, Segmented, Text } from '../../ui/kit';
import { useTheme } from '../../ui/theme';

const HOT_MAX_ML = 600;

// Same one-screen layout as the Dolce Gusto drink page, with Barista options (scoops / water / foam).
export default function BaristaDrinkScreen() {
  const { id, fav } = useLocalSearchParams<{ id: string; fav?: string }>();
  const drink = getBaristaDrink(id);
  const m = useMachine();
  const { favorites, add, remove } = useFavorites();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const preset = favorites.find((f) => f.id === fav);
  const defaults = drink ? baristaDefaults(drink) : { strength: 1, waterMl: 120, milkMl: 0 };
  const [strength, setStrength] = useState(preset?.baristaOptions?.strength ?? defaults.strength);
  const [waterMl, setWaterMl] = useState(preset?.baristaOptions?.waterMl ?? defaults.waterMl);
  const [milkMl, setMilkMl] = useState(preset?.baristaOptions?.milkMl ?? defaults.milkMl);
  const [previewH, setPreviewH] = useState(0);
  const [naming, setNaming] = useState(false);
  const hw = useHotWaterCalibration(m.machine?.id);
  const [hotMl, setHotMl] = useState(preset?.baristaOptions?.waterMl ?? 160);

  if (!drink) return <Redirect href="/menu" />;
  if (!m.machine) return <Redirect href="/" />;

  const model = m.machine.baristaModel;
  const custom = baristaCustomizable(model) && drink.options != null;
  const o = drink.options;
  const pal = baristaPalette(drink.id);
  const ink = baristaOnAccent(drink.id);
  const compact = height < 720;
  const water = custom ? { strength, waterMl, milkMl } : defaults;
  // Barista W hot water = rinse cycles (see planHotWater); needs a one-time calibration.
  const hotW = drink.id === 'hotWater' && model === 'w';
  const cal = hotW ? hw.calibration : null;
  const exact = cal != null && cal.stop !== 'none';
  const hotStep = cal ? (exact ? 5 : cal.rinseMl) : 5;
  const hotMin = cal ? (exact ? HOT_WATER_MIN_ML : cal.rinseMl) : HOT_WATER_MIN_ML;
  const hotMax = cal && !exact ? Math.floor(HOT_MAX_ML / cal.rinseMl) * cal.rinseMl : HOT_MAX_ML;
  const hotTarget = cal
    ? exact
      ? clamp(hotMl, hotMin, hotMax)
      : clamp(Math.round(hotMl / cal.rinseMl) * cal.rinseMl, hotMin, hotMax)
    : hotMl;
  const plan = cal ? planHotWater(hotTarget, cal) : null;
  const total = hotW ? (plan?.totalMl ?? hotTarget) : water.waterMl + (o?.milkMl ? water.milkMl : 0);
  const iced = drink.id === 'iced';
  const name = preset?.name ?? drink.name;
  const options = hotW ? { waterMl: hotTarget } : { strength, waterMl, milkMl: o?.milkMl ? milkMl : undefined };
  const starred = favorites.find(
    (f) =>
      f.kind === 'barista' &&
      f.baristaDrinkId === drink.id &&
      (!custom ||
        (hotW && f.baristaOptions?.waterMl === hotTarget) ||
        (!hotW &&
          f.baristaOptions?.strength === strength &&
          f.baristaOptions?.waterMl === waterMl &&
          (f.baristaOptions?.milkMl ?? 0) === (o?.milkMl ? milkMl : 0))),
  );
  const cupSize = Math.max(80, Math.min(previewH / 1.2, width * 0.6));

  const setStrengthClamped = (s: number) => {
    if (!o) return;
    const next = clamp(s, o.strength.min, o.strength.max);
    const r = baristaWaterRange(drink, next);
    setStrength(next);
    setWaterMl((w) => clamp(w, r.min, r.max));
  };
  const range = o ? baristaWaterRange(drink, strength) : null;

  const brew = () => {
    m.startBrew({
      capsuleId: 0,
      baristaDrinkId: drink.id,
      baristaOptions: hotW && cal ? { waterMl: hotTarget, hotWater: cal } : custom ? options : undefined,
      volumeLevel: 1,
      temperature: 'middle',
      iced,
    });
    router.push({
      pathname: '/brewing',
      params: { barista: drink.id, ml: String(total), iced: iced ? '1' : '0', cold: iced ? '1' : '0' },
    });
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        paddingTop: insets.top + 4,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 20,
        gap: compact ? 12 : 20,
      }}>
      <DrinkTopBar
        starred={!!starred}
        accent={pal.accent}
        onStar={() => (starred ? remove(starred.id) : setNaming(true))}
        onInfo={() =>
          router.push({
            pathname: '/howto/[id]',
            params: {
              id: drink.id,
              strength: String(strength),
              water: String(hotW ? hotTarget : waterMl),
              milk: String(milkMl),
            },
          })
        }
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BaristaArt id={drink.id} size={compact ? 48 : 60} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {name}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {preset && preset.name !== drink.name ? `${drink.name} · ` : ''}
            {drink.description}
          </Text>
        </View>
      </View>

      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onLayout={(e) => setPreviewH(e.nativeEvent.layout.height)}>
        {previewH > 0 && (
          <Cup
            level={total / BARISTA_CUP_MAX_ML}
            liquid={pal.liquid}
            foam={pal.foam}
            milk={drink.id === 'cappuccino' || drink.id === 'latte'}
            hot={!iced}
            iced={iced}
            size={cupSize}
          />
        )}
      </View>

      {hotW ? (
        cal && plan ? (
          <View style={{ gap: 8 }}>
            <StepperRow
              label="Water"
              value={`${hotTarget} ml`}
              canMinus={hotTarget > hotMin}
              canPlus={hotTarget + hotStep <= hotMax}
              onMinus={() => setHotMl(clamp(hotTarget - hotStep, hotMin, hotMax))}
              onPlus={() => setHotMl(clamp(hotTarget + hotStep, hotMin, hotMax))}
            />
            <Text variant="caption" muted>
              {planText(plan)}
            </Text>
          </View>
        ) : (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: t.surface, gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text weight={500}>Set up hot water (one-time, ~1 min)</Text>
              <Text variant="caption" muted>
                Barista W makes hot water from rinse cycles, so Brew measures one rinse first.
              </Text>
            </View>
            <Button
              title="Set up"
              kind="secondary"
              disabled={!hw.loaded}
              onPress={() => router.push('/hotwater-setup')}
            />
          </View>
        )
      ) : custom && o && range ? (
        <View style={{ gap: compact ? 8 : 12 }}>
          {o.temperatureC ? (
            <Segmented
              options={o.temperatureC.map((c, i) => ({ value: o.strength.min + i, label: `${c}°C` }))}
              value={strength}
              onChange={setStrengthClamped}
              accent={pal.accent}
              onAccentColor={ink}
            />
          ) : (
            <StepperRow
              label="Strength"
              value={`${strength} scoop${strength > 1 ? 's' : ''}`}
              canMinus={strength > o.strength.min}
              canPlus={strength < o.strength.max}
              onMinus={() => setStrengthClamped(strength - 1)}
              onPlus={() => setStrengthClamped(strength + 1)}
            />
          )}
          <StepperRow
            label="Water"
            value={`${waterMl} ml`}
            canMinus={waterMl > range.min}
            canPlus={waterMl < range.max}
            onMinus={() => setWaterMl((w) => clamp(w - range.step, range.min, range.max))}
            onPlus={() => setWaterMl((w) => clamp(w + range.step, range.min, range.max))}
          />
          {o.milkMl && (
            <StepperRow
              label="Milk foam"
              value={`${milkMl} ml`}
              canMinus={milkMl > o.milkMl.min}
              canPlus={milkMl < o.milkMl.max}
              onMinus={() => setMilkMl((v) => clamp(v - o.milkMl!.step, o.milkMl!.min, o.milkMl!.max))}
              onPlus={() => setMilkMl((v) => clamp(v + o.milkMl!.step, o.milkMl!.min, o.milkMl!.max))}
            />
          )}
        </View>
      ) : (
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: t.surface }}>
          <Text weight={500}>Uses the machine's stored recipe</Text>
          <Text variant="caption" muted>
            {model ? BARISTA_MODEL_NAMES[model] : 'This Barista'} brews this drink with its own settings.
          </Text>
        </View>
      )}

      <Glass radius={36} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, paddingLeft: 22, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{custom ? `${total} ml` : drink.name}</Text>
          <Text variant="caption" muted numberOfLines={1}>
            {hotW
              ? 'Rinse water'
              : iced
                ? 'Over ice'
                : o?.temperatureC
                  ? `${o.temperatureC[strength - o.strength.min]}°C`
                  : 'Hot'}
          </Text>
        </View>
        <Button
          title="Brew"
          onPress={brew}
          disabled={m.connection !== 'ready' || (!hotW && m.status?.coffee === 'empty') || (hotW && !cal)}
          color={pal.accent}
          textColor={ink}
          style={{ minWidth: 140 }}
        />
      </Glass>

      <NameSheet
        visible={naming}
        initial={drink.name}
        accent={pal.accent}
        ink={ink}
        onCancel={() => setNaming(false)}
        onSave={(n) => {
          add({
            kind: 'barista',
            capsuleId: 0,
            name: n,
            level: 1,
            temperature: 'middle',
            iced,
            baristaDrinkId: drink.id,
            baristaOptions: custom ? options : undefined,
          });
          setNaming(false);
        }}
      />
    </View>
  );
}

/** "2 rinses + 1 short pour · ≈ 250 ml" */
function planText(plan: ReturnType<typeof planHotWater>) {
  const full = plan.pours.filter((p) => p.stopAfterMs == null).length;
  const short = plan.pours.length - full;
  const parts = [];
  if (full) parts.push(`${full} rinse${full > 1 ? 's' : ''}`);
  if (short) parts.push(`${short} short pour`);
  return `${parts.join(' + ')} ≈ ${plan.totalMl} ml`;
}
