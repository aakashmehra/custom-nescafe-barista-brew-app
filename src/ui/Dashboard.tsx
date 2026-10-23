import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BARISTA_MODEL_NAMES } from '../data/baristaMenu';
import { CAPSULES, CATEGORY_LABEL, type CapsuleCategory } from '../data/capsules';
import { baristaDefaults, baristaDrinksFor, displayName, mlFor } from '../data/drink';
import { machineName, useMachine } from '../state/MachineProvider';
import { DrinkArt } from './art/DrinkArt';
import { BaristaArt } from './baristaArt';
import { GearIcon, JarIcon } from './Icons';
import { IconButton, Pill, Press, Text } from './kit';
import { useTheme } from './theme';

export const TAB_BAR_SPACE = 96;

const STATUS: Record<string, string> = {
  ready: 'Ready',
  sleeping: 'Sleeping',
  heating: 'Heating',
  brewing: 'Brewing',
  needsWater: 'Needs water',
  needsCapsule: 'Insert a capsule',
  error: 'Check the machine',
};

const COFFEE = {
  ok: { label: 'Coffee OK', color: '#34C759' },
  low: { label: 'Coffee low', color: '#F2A33A' },
  empty: { label: 'Refill coffee', color: '#FF453A' },
} as const;

/** Shared header for every tab: big title, machine status, coffee powder (Barista), settings button. */
export function DashboardHeader({ title }: { title: string }) {
  const m = useMachine();
  const t = useTheme();
  const status = m.connection === 'brewing' ? 'Brewing' : (STATUS[m.status?.readiness ?? ''] ?? 'Connected');
  const coffee = m.machine?.family === 'barista' && m.status?.coffee ? COFFEE[m.status.coffee] : null;
  return (
    <View style={{ gap: 6, paddingHorizontal: 4, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        <IconButton label="Settings" onPress={() => router.push('/settings')}>
          <GearIcon color={t.fg} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.machine ? '#34C759' : t.faint }} />
        <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {m.machine ? machineName(m.machine) : 'Not connected'} · {status}
        </Text>
        {m.kind === 'demo' && <Pill label="Demo" />}
        {coffee && (
          <View
            accessibilityLabel={coffee.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <JarIcon color={coffee.color} size={16} level={m.status!.coffee!} />
            <Text variant="caption" style={{ color: m.status!.coffee === 'ok' ? t.muted : coffee.color }}>
              {coffee.label}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function useCardWidth() {
  const { width } = useWindowDimensions();
  return (width - 16 * 2 - 12) / 2;
}

export function DrinkCard({
  art,
  title,
  subtitle,
  onPress,
  onLongPress,
  dimmed,
}: {
  art: (size: number) => ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  onLongPress?: () => void;
  dimmed?: boolean;
}) {
  const t = useTheme();
  const w = useCardWidth();
  return (
    <Press
      haptic="selection"
      accessibilityLabel={title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: w, borderRadius: 24, backgroundColor: t.surface, padding: 14, gap: 10, opacity: dimmed ? 0.45 : 1 }}>
      <View style={{ alignItems: 'center' }}>{art(w - 40)}</View>
      <View style={{ gap: 3 }}>
        <Text variant="headline" numberOfLines={2} style={{ fontSize: 15 }}>
          {title}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Press>
  );
}

function Grid<T>({
  title,
  data,
  keyOf,
  render,
}: {
  title: string;
  data: T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactElement;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      data={data}
      numColumns={2}
      keyExtractor={keyOf}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + TAB_BAR_SPACE,
        gap: 12,
      }}
      ListHeaderComponent={<DashboardHeader title={title} />}
      renderItem={({ item }) => render(item)}
    />
  );
}

export function Dashboard({ category }: { category: CapsuleCategory }) {
  return (
    <Grid
      title={CATEGORY_LABEL[category]}
      data={CAPSULES.filter((c) => c.category === category)}
      keyOf={(c) => String(c.capsuleId)}
      render={(c) => (
        <DrinkCard
          art={(size) => <DrinkArt capsuleId={c.capsuleId} size={size} />}
          title={displayName(c)}
          subtitle={`${mlFor(c, c.recommendAmount)} ml${c.capsuleCount === 2 ? ' · 2 capsules' : ''}`}
          onPress={() => router.push({ pathname: '/drink/[id]', params: { id: String(c.capsuleId) } })}
        />
      )}
    />
  );
}

/** Barista menu: only the drinks the connected model offers. */
export function BaristaDashboard() {
  const m = useMachine();
  const model = m.machine?.baristaModel;
  return (
    <Grid
      title={model ? BARISTA_MODEL_NAMES[model] : 'Barista'}
      data={baristaDrinksFor(model)}
      keyOf={(d) => d.id}
      render={(d) => {
        const o = baristaDefaults(d);
        return (
          <DrinkCard
            art={(size) => <BaristaArt id={d.id} size={size} />}
            title={d.name}
            subtitle={`${o.waterMl + o.milkMl} ml · ${d.description}`}
            onPress={() => router.push({ pathname: '/barista/[id]', params: { id: d.id } })}
          />
        );
      }}
    />
  );
}
