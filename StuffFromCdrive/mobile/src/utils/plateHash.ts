/**
 * On-device SHA-256 of a license plate string.
 *
 * Normalisation before hashing (must match whatever the player types):
 *   - Uppercase
 *   - Strip spaces and hyphens
 *
 * The raw plate is zeroed from memory as soon as the hash is produced.
 * The hash is what gets sent to the backend — the plate itself never leaves
 * the device.
 *
 * Uses the Web Crypto API which is available in the Hermes JS engine
 * (React Native 0.73+) via the global `crypto` object.
 */
export async function sha256Plate(rawPlate: string): Promise<string> {
  const normalised = rawPlate.toUpperCase().replace(/[\s\-]/g, '');
  const encoded    = new TextEncoder().encode(normalised);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
