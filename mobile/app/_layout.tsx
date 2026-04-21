import { useEffect } from 'react';
import { Stack, usePathname, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { usePlayerStore } from '@/stores/playerStore';
import { connectPostHog } from '@/lib/posthog';
import { ThemeProvider, useTheme } from '@/lib/theme';

const queryClient = new QueryClient();

const POSTHOG_API_KEY = 'phc_AF7zruUuPR2rA5g6t4p58uWNqEth9qhVCL8jik2h84Sa';
const POSTHOG_HOST    = 'https://us.i.posthog.com';

function PostHogTracker() {
  const client   = usePostHog();
  const userId   = usePlayerStore(s => s.userId);
  const username = usePlayerStore(s => s.username);
  const provider = usePlayerStore(s => s.provider);
  const pathname = usePathname();
  const params   = useLocalSearchParams();

  // Wire the provider-managed client into our lazy proxy so that
  // posthog.capture() calls throughout the app work without a module-level singleton.
  useEffect(() => {
    if (client) connectPostHog(client);
  }, [client]);

  useEffect(() => {
    if (!client) return;
    if (userId) {
      client.identify(userId, {
        ...(username ? { username } : {}),
        ...(provider ? { provider } : {}),
      });
    } else {
      client.reset();
    }
  }, [client, userId, username, provider]);

  useEffect(() => {
    if (client) client.screen(pathname, params as Record<string, string>);
  }, [client, pathname, params]);

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
    <PostHogProvider apiKey={POSTHOG_API_KEY} options={{ host: POSTHOG_HOST }}>
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
    </PostHogProvider>
  );
}
