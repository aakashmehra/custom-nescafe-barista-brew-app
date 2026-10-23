import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORY_LABEL, getCapsule } from '../../data/capsules';
import { CUP_MAX_ML, TEMP_LABEL, canIce, displayName, hasMilk, liquidKind, mlFor, temperatures } from '../../data/drink';
import type { TemperatureMode } from '../../machine';
import { useMachine } from '../../state/MachineProvider';
import { useFavorites } from '../../state/favorites';
import { DrinkArt } from '../../ui/art/DrinkArt';
import { drinkPalette, onAccent } from '../../ui/art/palette';
import { Cup } from '../../ui/Cup';
import { DrinkTopBar, NameSheet, StepButton } from '../../ui/DrinkParts';
import { Button, Glass, Segmented, Text } from '../../ui/kit';
import { useTheme } from '../../ui/theme';

// One screen, no scrolling: the cup preview takes whatever height is left after the controls.
export default function DrinkScreen() {
  const { id, fav } = useLocalSearchParams<{ id: string; fav?: string }>();
  const capsule = getCapsule(Number(id));
  const m = useMachine();
  const { favorites, add, remove } = useFavorites();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const preset = favorites.find((f) => f.id === fav);
  const [level, setLevel] = useState(preset?.level ?? capsule?.recommendAmount ?? 4);
  const [temperature, setTemperature] = useState<TemperatureMode>(preset?.temperature ?? 'high');
  const [iced, setIced] = useState(preset?.iced ?? false);
  const [previewH, setPreviewH] = useState(0);
  const [naming, setNaming] = useState(false);

  if (!capsule) return <Redirect href="/" />;
  if (!m.machine) return <Redirect href="/" />;

  const pal = drinkPalette(capsule.capsuleId);
  const ink = onAccent(capsule.capsuleId);
  const compact = height < 720;
  const gap = compact ? 12 : 20;
  const ml = mlFor(capsule, level);
  const min = capsule.amountLowerLimit;
  const max = capsule.amountUpperLimit;
  const cold = iced || temperature === 'cold';
  const name = preset?.name ?? displayName(capsule);
  const starred = favorites.find(
    (f) => f.capsuleId === capsule.capsuleId && f.level === level && f.temperature === temperature && f.iced === iced,
  );
  const cupSize = Math.max(80, Math.min(previewH / 1.2, width * 0.6));

  const brew = () => {
    m.startBrew({ capsuleId: capsule.capsuleId, volumeLevel: level, temperature, iced });
    router.push({
      pathname: '/brewing',
      params: { id: String(capsule.capsuleId), level: String(level), iced: iced ? '1' : '0', cold: cold ? '1' : '0' },
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
        gap,
      }}>
      <DrinkTopBar
        starred={!!starred}
        accent={pal.accent}
        onStar={() => (starred ? remove(starred.id) : setNaming(true))}
        onInfo={() => router.push({ pathname: '/howto/[id]', params: { id: String(capsule.capsuleId) } })}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <DrinkArt capsuleId={capsule.capsuleId} size={compact ? 48 : 60} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {name}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {preset && preset.name !== displayName(capsule) ? `${displayName(capsule)} · ` : ''}
            {CATEGORY_LABEL[capsule.category]}
            {capsule.capsuleCount === 2 ? ' · 2 capsules' : ''}
          </Text>
        </View>
      </View>

      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onLayout={(e) => setPreviewH(e.nativeEvent.layout.height)}>
        {previewH > 0 && (
          <Cup
            level={ml / CUP_MAX_ML}
            kind={liquidKind(capsule)}
            liquid={pal.liquid}
            foam={pal.foam}
            milk={hasMilk(capsule)}
            hot={!cold}
            iced={iced}
            size={cupSize}
          />
        )}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StepButton label="−" disabled={level <= min} onPress={() => setLevel((l) => Math.max(min, l - 1))} />
          <View style={{ alignItems: 'center' }}>
            <Text variant={compact ? 'title' : 'display'} style={{ fontVariant: ['tabular-nums'] }}>
              {ml}
              <Text variant="headline" muted>
                {' '}ml
              </Text>
            </Text>
            <Text variant="caption" muted>
              {level === capsule.recommendAmount ? 'Recommended' : `Level ${level} of ${max}`}
            </Text>
          </View>
          <StepButton label="+" disabled={level >= max} onPress={() => setLevel((l) => Math.min(max, l + 1))} />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {capsule.barLevels
            .filter((b) => b.amount >= min && b.amount <= max)
            .map((b) => (
              <View
                key={b.amount}
                style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: b.amount <= level ? pal.accent : t.hairline }}
              />
            ))}
        </View>
      </View>

      <Segmented
        options={temperatures(capsule).map((v) => ({ value: v, label: TEMP_LABEL[v] }))}
        value={temperature}
        onChange={setTemperature}
        accent={pal.accent}
        onAccentColor={ink}
      />

      {canIce(capsule) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="headline">Iced</Text>
            <Text variant="caption" muted>
              Brew over ice in a tall glass
            </Text>
          </View>
          <Switch value={iced} onValueChange={setIced} trackColor={{ true: pal.accent, false: t.hairline }} />
        </View>
      )}

      <Glass radius={36} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, paddingLeft: 22, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline">{ml} ml</Text>
          <Text variant="caption" muted>
            {iced ? 'Iced' : TEMP_LABEL[temperature]}
          </Text>
        </View>
        <Button
          title="Brew"
          onPress={brew}
          disabled={m.connection !== 'ready'}
          color={pal.accent}
          textColor={ink}
          style={{ minWidth: 140 }}
        />
      </Glass>

      <NameSheet
        visible={naming}
        initial={displayName(capsule)}
        accent={pal.accent}
        ink={ink}
        onCancel={() => setNaming(false)}
        onSave={(n) => {
          add({ capsuleId: capsule.capsuleId, name: n, level, temperature, iced });
          setNaming(false);
        }}
      />
    </View>
  );
}
