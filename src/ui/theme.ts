import { StyleSheet, useColorScheme } from 'react-native';

const dark = {
  dark: true,
  bg: '#000000',
  fg: '#FFFFFF',
  muted: '#8E8E8E',
  faint: '#5A5A5A',
  hairline: '#2A2A2A',
  surface: '#111111',
  surfaceHi: '#1C1C1C',
  // monochrome liquid tones
  coffee: '#E6E6E6',
  milk: '#8C8C8C',
  tea: '#B3B3B3',
};

const light: typeof dark = {
  dark: false,
  bg: '#FFFFFF',
  fg: '#000000',
  muted: '#707070',
  faint: '#A8A8A8',
  hairline: '#E2E2E2',
  surface: '#F5F5F5',
  surfaceHi: '#EBEBEB',
  coffee: '#1A1A1A',
  milk: '#A6A6A6',
  tea: '#5E5E5E',
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const font = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

export const hairline = StyleSheet.hairlineWidth;
