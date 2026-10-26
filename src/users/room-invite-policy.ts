export const ROOM_INVITE_POLICIES = [
  'everyone',
  'following',
  'nobody',
] as const;
export type RoomInvitePolicy = (typeof ROOM_INVITE_POLICIES)[number];
