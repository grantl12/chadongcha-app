/**
 * uploadPhoto — uploads a local camera photo to Cloudflare R2 via a
 * backend-issued presigned PUT URL. Fire-and-forget safe: callers should
 * not block the catch flow on this.
 *
 * Flow:
 *   1. GET /uploads/presign  → { upload_url, key }
 *   2. Read local file as blob
 *   3. PUT blob to upload_url (direct to R2, no backend proxy)
 *   4. Return the R2 key for storage in the catch record
 */

import { apiClient } from '@/api/client';

type PresignResponse = {
  upload_url: string;
  key: string;
};

/**
 * Upload a photo at a local file path to R2.
 * Returns the R2 object key on success, or null on any failure.
 * Never throws — failures are silent so they don't disrupt catch flow.
 */
export async function uploadPhoto(
  localPath: string,
  catchType: string,
): Promise<string | null> {
  try {
    // 1. Get a presigned PUT URL from the backend
    const { upload_url, key } = await apiClient.get(
      `/uploads/presign?catch_type=${encodeURIComponent(catchType)}`,
    ) as PresignResponse;

    // 2. Fetch the local file as a blob
    //    React Native fetch() handles file:// URIs natively.
    const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
    const fileResponse = await fetch(fileUri);
    if (!fileResponse.ok) return null;
    const blob = await fileResponse.blob();

    // 3. PUT directly to R2 — no auth header (presigned URL carries credentials)
    const uploadResponse = await fetch(upload_url, {
      method:  'PUT',
      body:    blob,
      headers: { 'Content-Type': 'image/jpeg' },
    });

    if (!uploadResponse.ok) return null;
    return key;
  } catch {
    // Network failure, file read error, etc. — don't break the catch flow.
    return null;
  }
}
