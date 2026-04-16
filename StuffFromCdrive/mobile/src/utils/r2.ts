/**
 * r2 — helpers for resolving Cloudflare R2 object keys to public URLs.
 *
 * The public base URL is injected at build time via EAS env var R2_PUBLIC_URL
 * and exposed through expo-constants extras.
 */

import Constants from 'expo-constants';

function getBase(): string {
  const url = Constants.expoConfig?.extra?.r2PublicUrl as string | undefined;
  return (url ?? '').replace(/\/$/, '');
}

/**
 * Build a full public URL from an R2 object key.
 * Returns null if the base URL is not configured (dev without EAS env).
 */
export function r2Url(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = getBase();
  if (!base) return null;
  return `${base}/${key}`;
}
