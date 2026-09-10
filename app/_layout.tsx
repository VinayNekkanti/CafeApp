import {
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_500Medium,
} from '@expo-google-fonts/lora';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { LocationProvider } from '../src/context/LocationContext';
import { THEME } from '../src/constants/theme';
import LoadingScreen from '../src/components/LoadingScreen';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Keep SpaceMono since the template relies on it
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    // Classical design system: Cormorant Garamond (display) over Lora (body)
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_500Medium,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <LocationProvider>
        <RootLayoutNav />
      </LocationProvider>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  // Classical is a single warm-paper palette — no dark-mode branch.
  const themeColors = THEME.colors;
  const router = useRouter();
  const segments = useSegments();
  const { user, isProfileComplete, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    const currentSegment = segments[0] || '';
    const inAuth = currentSegment === 'auth';
    const inOnboarding = currentSegment === 'onboarding';

    if (user && !isProfileComplete) {
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else if (user && isProfileComplete) {
      if (inAuth || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [user, isProfileComplete, authLoading, segments]);

  if (authLoading) {
    return <LoadingScreen message="Restoring session..." />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: themeColors.bg,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: themeColors.text,
          fontFamily: THEME.fonts.displaySemi,
          fontSize: 19,
        },
        headerTintColor: themeColors.accent700,
        contentStyle: {
          backgroundColor: themeColors.bg,
        },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="cafe/[id]" options={{ headerTitle: 'Cafe Profile', headerBackTitle: 'Back' }} />
      <Stack.Screen name="auth" options={{ headerTitle: 'Authentication', headerBackTitle: 'Back' }} />
      <Stack.Screen name="onboarding" options={{ headerTitle: 'Complete Profile', headerShown: false }} />
    </Stack>
  );
}
