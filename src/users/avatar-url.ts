export const AVATAR_URL_MAX_LENGTH = 255;

/** A syntactically valid https URL without embedded credentials, else null. */
export function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > AVATAR_URL_MAX_LENGTH)
    return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Response guard: avatars are always a full https URL or null. */
export function avatarOrNull(value: unknown): string | null {
  return parseHttpsUrl(value) ? (value as string) : null;
}

/**
 * True when `value` is an https URL inside the uploads public base
 * (R2_PUBLIC_URL), i.e. one that POST /uploads/file?folder=avatars returns.
 */
export function isOwnAvatarUrl(value: string, publicBase: string): boolean {
  const url = parseHttpsUrl(value);
  const base = parseHttpsUrl(publicBase);
  if (!url || !base || url.search || url.hash) return false;
  const prefix = `${base.pathname.replace(/\/+$/, '')}/paradiso/avatars/`;
  return url.origin === base.origin && url.pathname.startsWith(prefix);
}
