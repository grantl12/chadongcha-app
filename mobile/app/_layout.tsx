import { useEffect } from 'react';
import { Stack, usePathname, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider } from 'posthog-react-native';
import { usePlayerStore } from '@/stores/playerStore';
import { posthog } from '@/lib/posthog';
import { ThemeProvider, useTheme } from '@/lib/theme';

const queryClient = new QueryClient();

function PostHogTracker() {
  const userId   = usePlayerStore(s => s.userId);
  const username = usePlayerStore(s => s.username);
  const provider = usePlayerStore(s => s.provider);
  const pathname = usePathname();
  const params = useLocalSearchParams();

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
    <PostHogProvider client={posthog}>
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
