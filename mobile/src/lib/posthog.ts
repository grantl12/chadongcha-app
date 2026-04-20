import PostHog from 'posthog-react-native';

// Singleton used by non-component code (stores, utils).
// Components should use the usePostHog() hook instead.
export const posthog = new PostHog('phc_AF7zruUuPR2rA5g6t4p58uWNqEth9qhVCL8jik2h84Sa', {
  host: 'https://us.i.posthog.com',
});
