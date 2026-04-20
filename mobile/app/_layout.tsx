import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PostHogProvider } from 'posthog-react-native';
import { usePlayerStore } from '@/stores/playerStore';
import { posthog } from '@/lib/posthog';

const queryClient = new QueryClient();

function UserIdentifier() {
  const userId = usePlayerStore(s => s.userId);
  const username = usePlayerStore(s => s.username);
  useEffect(() => {
    if (userId) {
      posthog.identify(userId, { username: username ?? undefined });
    } else {
      posthog.reset();
    }
  }, [userId, username]);
  return null;
}

export default function RootLayout() {
  return (
    <PostHogProvider client={posthog}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <UserIdentifier />
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="highway" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="scan360" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="vehicle/[id]" options={{ presentation: 'card' }} />
            </Stack>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PostHogProvider>
  );
}
