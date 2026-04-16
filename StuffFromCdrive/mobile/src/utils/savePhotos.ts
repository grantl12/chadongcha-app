/**
 * savePhotos — copies 360° scan photos from Vision Camera's temp directory
 * into the app's permanent documents folder.
 *
 * Vision Camera writes to a session-scoped cache path that the OS can
 * evict at any time. This utility copies them to:
 *   <documentDirectory>/catch-photos/<uid>/<angle>.jpg
 *
 * where <uid> is a caller-provided unique ID (the catch ID).
 * Returns the permanent paths in anchor order.
 */

import * as FileSystem from 'expo-file-system';

export type AnchorLabel = 'front' | 'passenger' | 'rear' | 'driver';

const ANCHORS: AnchorLabel[] = ['front', 'passenger', 'rear', 'driver'];

/** Root directory for all persisted catch photos. */
function photosDir(): string {
  return `${FileSystem.documentDirectory}catch-photos/`;
}

/** Directory for a specific catch's photos. */
function catchDir(catchId: string): string {
  return `${photosDir()}${catchId}/`;
}

/**
 * Copy up to 4 temp photo paths into permanent storage for a catch.
 *
 * @param tempPaths  Array of temp paths, indexed [front, passenger, rear, driver].
 *                   Gaps (undefined/null) are skipped.
 * @param catchId    Unique catch ID used as the folder name.
 * @returns          Array of permanent paths in the same order.
 *                   Missing photos produce an empty string at that index.
 */
export async function savePhotos(
  tempPaths: (string | null | undefined)[],
  catchId: string,
): Promise<string[]> {
  const dir = catchDir(catchId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const results: string[] = [];
  for (let i = 0; i < Math.min(tempPaths.length, 4); i++) {
    const src = tempPaths[i];
    if (!src) {
      results.push('');
      continue;
    }
    const dest = `${dir}${ANCHORS[i]}.jpg`;
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      results.push(dest);
    } catch {
      // Photo may have already been cleaned up — not fatal.
      results.push('');
    }
  }
  return results;
}

/**
 * Delete all saved photos for a catch (e.g. if the catch is deleted or sold).
 */
export async function deletePhotos(catchId: string): Promise<void> {
  const dir = catchDir(catchId);
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {
    // best-effort
  }
}
