import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { font, hairline, useTheme } from './theme';

// Liquid Glass needs iOS 26+ and a runtime where the API actually exists (some iOS 26 betas crash).
export const glassAvailable = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

type TextVariant = 'display' | 'title' | 'headline' | 'body' | 'caption' | 'label';
const variants: Record<TextVariant, { size: number; weight: keyof typeof font; spacing: number; line?: number }> = {
  display: { size: 40, weight: 700, spacing: -1.2, line: 44 },
  title: { size: 28, weight: 700, spacing: -0.7, line: 32 },
  headline: { size: 17, weight: 600, spacing: -0.3 },
  body: { size: 15, weight: 400, spacing: -0.1, line: 21 },
  caption: { size: 13, weight: 500, spacing: 0 },
  label: { size: 11, weight: 600, spacing: 0.6 },
};

export function Text({
  variant = 'body',
  muted,
  weight,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; muted?: boolean; weight?: keyof typeof font }) {
  const t = useTheme();
  const v = variants[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: font[weight ?? v.weight],
          fontSize: v.size,
          letterSpacing: v.spacing,
          lineHeight: v.line,
          color: muted ? t.muted : t.fg,
          textTransform: variant === 'label' ? 'uppercase' : undefined,
        },
        style,
      ]}
    />
  );
}

/** Floating surface: Liquid Glass on iOS 26+, otherwise a solid surface with a hairline border. */
export function Glass({
  children,
  style,
  radius = 24,
  interactive,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  interactive?: boolean;
}) {
  const t = useTheme();
  if (glassAvailable) {
    return (
      <GlassView isInteractive={interactive} style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        { borderRadius: radius, backgroundColor: t.surface, borderWidth: hairline, borderColor: t.hairline },
        style,
      ]}>
      {children}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with a subtle press-in. */
export function Press({
  onPress,
  children,
  style,
  disabled,
  haptic = 'light',
  accessibilityLabel,
  onLongPress,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: 'light' | 'selection' | 'none';
  accessibilityLabel?: string;
}) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => (s.value = withTiming(0.97, { duration: 90, easing: Easing.out(Easing.cubic) }))}
      onPressOut={() => (s.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }))}
      onLongPress={onLongPress}
      onPress={() => {
        if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (haptic === 'selection') Haptics.selectionAsync();
        onPress?.();
      }}
      style={[anim, disabled && { opacity: 0.4 }, style]}>
      {children}
    </AnimatedPressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  style,
  color,
  textColor,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary';
  color?: string;
  textColor?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const primary = kind === 'primary';
  const fg = primary ? (textColor ?? t.bg) : t.fg;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={title}
      style={[
        {
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          backgroundColor: primary ? (color ?? t.fg) : 'transparent',
          borderWidth: primary ? 0 : hairline,
          borderColor: t.faint,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text variant="headline" style={{ color: fg }}>
          {title}
        </Text>
      )}
    </Press>
  );
}

export function Pill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 99,
          borderWidth: hairline,
          borderColor: t.faint,
        },
        style,
      ]}>
      <Text variant="label" muted style={{ fontSize: 10 }}>
        {label}
      </Text>
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  accent,
  onAccentColor,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
  onAccentColor?: string;
}) {
  const t = useTheme();
  return (
    <Glass radius={22} style={{ flexDirection: 'row', padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={String(o.value)}
            haptic="selection"
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? (accent ?? t.fg) : 'transparent',
            }}>
            <Text variant="caption" weight={600} style={{ color: on ? (onAccentColor ?? t.bg) : t.muted }}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </Glass>
  );
}

/** Round glass button holding an icon. */
export function IconButton({
  onPress,
  label,
  children,
  size = 44,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
  size?: number;
}) {
  return (
    <Press onPress={onPress} accessibilityLabel={label} haptic="selection">
      <Glass radius={size / 2} interactive style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Glass>
    </Press>
  );
}
