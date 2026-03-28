/**
 * Extract Storage object path from a Firebase download URL
 * (https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...)
 */
export function storageObjectPathFromDownloadUrl(url: string): string | null {
  const u = url.trim();
  const m = u.match(/\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
