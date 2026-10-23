import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBaristaDrink } from '../../data/baristaMenu';
import { getCapsule } from '../../data/capsules';
import { TEMP_LABEL, displayName, mlFor } from '../../data/drink';
import { useMachine } from '../../state/MachineProvider';
import { useFavorites, type Favorite } from '../../state/favorites';
import { DrinkArt } from '../../ui/art/DrinkArt';
import { BaristaArt } from '../../ui/baristaArt';
import { DashboardHeader, DrinkCard, TAB_BAR_SPACE } from '../../ui/Dashboard';
import { StarIcon } from '../../ui/Icons';
import { Text } from '../../ui/kit';
import { useTheme } from '../../ui/theme';

const summary = (f: Favorite) => {
  if (f.kind === 'barista') {
    const d = getBaristaDrink(f.baristaDrinkId);
    const o = f.baristaOptions ?? {};
    const parts = [`${(o.waterMl ?? 0) + (o.milkMl ?? 0)} ml`];
    if (o.strength && d?.id !== 'hotWater') parts.push(`${o.strength} scoop${o.strength > 1 ? 's' : ''}`);
    if (d && f.name !== d.name) parts.unshift(d.name);
    return parts.join(' · ');
  }
  const c = getCapsule(f.capsuleId);
  const parts = [c ? `${mlFor(c, f.level)} ml` : `Level ${f.level}`, f.iced ? 'Iced' : TEMP_LABEL[f.temperature]];
  if (c && f.name !== displayName(c)) parts.unshift(displayName(c));
  return parts.join(' · ');
};

export default function FavoritesScreen() {
  const { favorites, remove } = useFavorites();
  const m = useMachine();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const barista = m.machine?.family === 'barista';
  const model = m.machine?.baristaModel;

  // A favorite is brewable only on a matching machine (and, for Barista, a model that offers the drink).
  const compatible = (f: Favorite) => {
    if (f.kind !== 'barista') return !barista;
    const d = getBaristaDrink(f.baristaDrinkId);
    return barista && !!d && (!model || d.models.includes(model));
  };

  const confirmRemove = (f: Favorite) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove favorite?', f.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(f.id) },
    ]);
  };

  const open = (f: Favorite) => {
    if (!compatible(f)) {
      Alert.alert(
        f.kind === 'barista' ? 'Needs a Barista' : 'Needs a Dolce Gusto',
        f.kind === 'barista'
          ? 'Connect a Nescafé Barista that makes this drink to brew this favorite.'
          : 'Connect a Dolce Gusto machine to brew this favorite.',
      );
      return;
    }
    if (f.kind === 'barista') router.push({ pathname: '/barista/[id]', params: { id: f.baristaDrinkId!, fav: f.id } });
    else router.push({ pathname: '/drink/[id]', params: { id: String(f.capsuleId), fav: f.id } });
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      data={favorites}
      numColumns={2}
      keyExtractor={(f) => f.id}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + TAB_BAR_SPACE,
        gap: 12,
        flexGrow: 1,
      }}
      ListHeaderComponent={<DashboardHeader title="Favorites" />}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
          <StarIcon color={t.faint} size={40} />
          <Text variant="headline">No favorites yet</Text>
          <Text muted style={{ textAlign: 'center' }}>
            Tap the star on any drink to save it with your settings.
          </Text>
        </View>
      }
      ListFooterComponent={
        favorites.length ? (
          <Text variant="caption" muted style={{ textAlign: 'center', paddingTop: 8 }}>
            Long-press a favorite to remove it.
          </Text>
        ) : null
      }
      renderItem={({ item: f }) => {
        const ok = compatible(f);
        const needs = f.kind === 'barista' ? 'Needs Barista' : 'Needs Dolce Gusto';
        return (
          <DrinkCard
            art={(size) =>
              f.kind === 'barista' && f.baristaDrinkId ? (
                <BaristaArt id={f.baristaDrinkId} size={size} />
              ) : (
                <DrinkArt capsuleId={f.capsuleId} size={size} />
              )
            }
            title={f.name}
            subtitle={ok ? summary(f) : needs}
            dimmed={!ok}
            onPress={() => open(f)}
            onLongPress={() => confirmRemove(f)}
          />
        );
      }}
    />
  );
}
