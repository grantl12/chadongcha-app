import { useEffect } from 'react';
import { Stack, usePathname, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PostHog from 'posthog-react-native';
import { usePlayerStore } from '@/stores/playerStore';
import { connectPostHog, posthog } from '@/lib/posthog';
import { ThemeProvider, useTheme } from '@/lib/theme';

const queryClient = new QueryClient();

const POSTHOG_API_KEY = 'phc_AF7zruUuPR2rA5g6t4p58uWNqEth9qhVCL8jik2h84Sa';
const POSTHOG_HOST    = 'https://us.i.posthog.com';

function PostHogTracker() {
  const userId   = usePlayerStore(s => s.userId);
  const username = usePlayerStore(s => s.username);
  const provider = usePlayerStore(s => s.provider);
  const pathname = usePathname();
  const params   = useLocalSearchParams();

  // Instantiate PostHog after mount, not at module load time.
  // PostHogProvider (the React context wrapper) crashes in production because
  // posthog-react-native 3.3.7 references React without importing it — a
  // bundler scope issue. Bypassing the provider and using the class directly
  // in useEffect avoids both the module-load native crash and the React scope crash.
  useEffect(() => {
    const client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
    connectPostHog(client);
  }, []);

  useEffect(() => {
    if (userId) {
      posthog.identify(userId, {
        ...(username ? { username } : {}),
        ...(provider ? { provider } : {}),
      });
    } else {
      posthog.reset();
    }
  }, [userId, username, provider]);

  useEffect(() => {
    posthog.screen(pathname, params);
  }, [pathname, params]);

  return null;
}

function ThemedStack() {
  const T = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="highway" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="scan360" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="vehicle/[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <PostHogTracker />
            <StatusBar style="light" />
            <ThemedStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
