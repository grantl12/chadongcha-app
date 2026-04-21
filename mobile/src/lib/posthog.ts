import PostHog from 'posthog-react-native';

// The client is set by PostHogTracker after PostHogProvider mounts.
// This avoids creating a PostHog instance at module load time, which caused
// a boot crash on iOS with posthog-react-native 3.x (new PostHog() calls
// native storage before the RN runtime is fully ready).
let _client: PostHog | undefined;

export function connectPostHog(client: PostHog): void {
  _client = client;
}

// Null-safe proxy — silently no-ops until the provider connects the client.
// All existing posthog.capture / identify / screen / reset calls still work.
export const posthog = {
  capture(event: string, properties?: Record<string, unknown>): void {
    _client?.capture(event, properties as Parameters<PostHog['capture']>[1]);
  },
  identify(userId: string, properties?: Record<string, unknown>): void {
    _client?.identify(userId, properties as Parameters<PostHog['identify']>[1]);
  },
  screen(name: string, properties?: Record<string, unknown>): void {
    _client?.screen(name, properties as Parameters<PostHog['screen']>[1]);
  },
  reset(): void {
    _client?.reset();
  },
};
