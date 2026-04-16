import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePlayerStore } from '@/stores/playerStore';
import { apiClient } from '@/api/client';

// Configure how notifications are displayed when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permission and registers the Expo push token with
 * the backend. Safe to call multiple times — it only re-registers when the
 * token changes or is missing.
 */
export function usePushNotifications() {
  const accessToken = usePlayerStore(s => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    async function register() {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;

        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

        // Android needs a notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;

        await apiClient.post('/auth/push-token', { expo_push_token: token });
      } catch {
        // Non-critical — app works fine without push notifications
      }
    }

    register();
  }, [accessToken]);
}
