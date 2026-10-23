import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { font, useTheme } from '../theme';
import { APP_ICONS, type AppIcon } from './appIcons';

type IconsModule = typeof import('expo-alternate-app-icons');
type NativeName = Parameters<IconsModule['setAlternateAppIcon']>[0];

// The native module only exists in a dev/production build (not Expo Go, not web),
// so check for it before touching the JS wrapper, which throws when it's missing.
const icons: IconsModule | null = requireOptionalNativeModule('ExpoAlternateAppIcons')
  ? (require('expo-alternate-app-icons') as IconsModule)
  : null;
const canSwitch = icons?.supportsAlternateIcons ?? false;

const idFor = (native: string | null) => APP_ICONS.find((i) => i.native === native)?.id ?? APP_ICONS[0].id;

export function AppIconPicker(): React.JSX.Element {
  const t = useTheme();
  const [current, setCurrent] = useState<string>(APP_ICONS[0].id);

  useEffect(() => {
    if (canSwitch && icons) setCurrent(idFor(icons.getAppIconName()));
  }, []);

  const choose = async (icon: AppIcon) => {
    if (icon.id === current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previous = current;
    setCurrent(icon.id);
    if (!canSwitch || !icons) return;
    try {
      await icons.setAlternateAppIcon(icon.native as NativeName);
    } catch {
      setCurrent(previous);
    }
  };

  return (
    <View>
      {!canSwitch && (
        <Text style={[styles.notice, { color: t.muted, fontFamily: font[500] }]}>
          Icon switching works in the installed app
        </Text>
      )}
      <View style={styles.grid}>
        {APP_ICONS.map((icon) => {
          const selected = icon.id === current;
          return (
            <Pressable
              key={icon.id}
              onPress={() => void choose(icon)}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${icon.name} app icon`}
              accessibilityState={{ selected }}
            >
              <View style={[styles.ring, { borderColor: selected ? t.fg : 'transparent' }]}>
                <Image source={icon.preview} style={[styles.preview, { borderColor: t.hairline }]} />
              </View>
              {selected && (
                <View style={[styles.badge, { backgroundColor: t.fg, borderColor: t.bg }]}>
                  <Svg width={10} height={10} viewBox="0 0 10 10">
                    <Path d="M2 5.2 L4.2 7.3 L8 2.8" stroke={t.bg} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
              )}
              <Text
                numberOfLines={1}
                style={[styles.name, { color: selected ? t.fg : t.muted, fontFamily: font[500] }]}
              >
                {icon.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const SIZE = 60;
const styles = StyleSheet.create({
  notice: { fontSize: 13, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  tile: { width: '25%', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  ring: { padding: 3, borderWidth: 2, borderRadius: SIZE * 0.2237 + 5 },
  preview: { width: SIZE, height: SIZE, borderRadius: SIZE * 0.2237, borderWidth: StyleSheet.hairlineWidth },
  badge: {
    position: 'absolute',
    top: -2,
    right: '50%',
    marginRight: -SIZE / 2 - 9,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, marginTop: 6 },
});
