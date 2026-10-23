import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { MachineProvider } from '../state/MachineProvider';
import { FavoritesProvider } from '../state/favorites';
import { useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const t = useTheme();
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg);
  }, [t.bg]);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <MachineProvider>
      <FavoritesProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="drink/[id]" />
          <Stack.Screen
            name="howto/[id]"
            options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 1], sheetGrabberVisible: true }}
          />
          <Stack.Screen name="brewing" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="settings" />
        </Stack>
      </FavoritesProvider>
    </MachineProvider>
  );
}
