// PostHog client connected lazily by PostHogTracker after component mount.
// No import from posthog-react-native here — keeps this module side-effect free.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any;

export function connectPostHog(client: any): void {
  _client = client;
}

export const posthog = {
  capture(event: string, properties?: Record<string, unknown>): void {
    _client?.capture(event, properties);
  },
  identify(userId: string, properties?: Record<string, unknown>): void {
    _client?.identify(userId, properties);
  },
  screen(name: string, properties?: Record<string, unknown>): void {
    _client?.screen(name, properties);
  },
  reset(): void {
    _client?.reset();
  },
};
