import { avatarOrNull, isOwnAvatarUrl } from './avatar-url';

describe('avatar URL rules', () => {
  const base = 'https://cdn.example.test/';
  const own = 'https://cdn.example.test/paradiso/avatars/avatar-1-uuid.webp';

  it('accepts URLs returned by the avatar upload', () => {
    expect(isOwnAvatarUrl(own, base)).toBe(true);
    expect(isOwnAvatarUrl(own, 'https://cdn.example.test')).toBe(true);
    expect(
      isOwnAvatarUrl(
        'https://cdn.example.test/media/paradiso/avatars/a.png',
        'https://cdn.example.test/media',
      ),
    ).toBe(true);
  });

  it.each([
    ['a data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ['plain http', own.replace('https:', 'http:')],
    ['another host', 'https://evil.example.test/paradiso/avatars/a.png'],
    [
      'a look-alike host',
      'https://cdn.example.test.evil.test/paradiso/avatars/a.png',
    ],
    [
      'embedded credentials',
      'https://u:p@cdn.example.test/paradiso/avatars/a.png',
    ],
    ['another port', 'https://cdn.example.test:8443/paradiso/avatars/a.png'],
    ['another folder', 'https://cdn.example.test/paradiso/posters/a.png'],
    [
      'path traversal',
      'https://cdn.example.test/paradiso/avatars/../posters/a.png',
    ],
    ['a query string', own + '?x=1'],
    ['a fragment', own + '#x'],
    ['a relative path', '/paradiso/avatars/a.png'],
    ['an over-long URL', own + 'a'.repeat(300)],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isOwnAvatarUrl(value, base)).toBe(false);
  });

  it('serializes only https URLs, everything else as null', () => {
    expect(avatarOrNull(own)).toBe(own);
    expect(avatarOrNull('http://x.test/a.png')).toBeNull();
    expect(avatarOrNull('javascript:alert(1)')).toBeNull();
    expect(avatarOrNull('data:image/png;base64,AAAA')).toBeNull();
    expect(avatarOrNull('/relative.png')).toBeNull();
    expect(avatarOrNull(null)).toBeNull();
    expect(avatarOrNull(undefined)).toBeNull();
  });
});
