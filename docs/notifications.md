# Notifications API

In-app notifications for the bell in the web header. The server creates them
as a side effect of other actions, in the same transaction, so there is no
endpoint to create one. Nobody is notified about their own actions.

Regular chat messages do not create notifications. Unread chat is a per-room
count; see [Chat unread](#chat-unread) below.

## Types

| `type`           | Recipient                             | Trigger                                       | `entity`  |
| ---------------- | ------------------------------------- | --------------------------------------------- | --------- |
| `room_invite`    | Invited user, if they have an account | An invitation to them becomes pending         | `room`    |
| `room_invite_approval` | Room owner                      | A member invites someone to a private room    | `room`    |
| `room_invite_accepted` | Inviter                         | The invitation is accepted                    | `room`    |
| `room_invite_rejected` | Inviter                         | The owner rejects the invitation              | `room`    |
| `movie_added`    | Room members and owner                | A movie (TMDb or custom) is added to the room | `movie`   |
| `chat_mention`   | Mentioned user, or replied-to author  | A chat message mentions or replies to them    | `message` |
| `post_liked`     | Post author                           | Someone likes the post (dislikes are silent)  | `post`    |
| `post_commented` | Post author                           | Someone comments on the post                  | `post`    |

- `chat_mention` has `data.reason` set to `mention` or `reply`. Editing a
  message notifies only the people the edit newly mentions. Only current room
  members are notified.
- All `room_invite*` notifications carry `data.invitationId`. For
  `room_invite`, answer it with `POST /room-invitations/:id/accept` or
  `/decline`; see [room invitations](room-invitations.md). Invitations sent by
  email address to an account also carry `data.inviteToken`, the same token as
  the email link, which still works with `POST /room-invitations/accept`.
  Re-inviting refreshes the unread `room_invite` notification for that room
  rather than adding a second one.

### Grouping

`post_liked` and `post_commented` group per post while unread. A new like
or comment updates the existing unread notification: `actor` becomes the new
actor, `actorCount` goes up by one and `updatedAt` moves, so it rises to the
top. Render it as "Sara and 2 others liked your post". The same person
reacting twice in a row does not raise `actorCount`. Once it is read, the
next like or comment starts a new notification.

### Item shape

```json
{
  "id": "7b1e…",
  "type": "post_liked",
  "read": false,
  "createdAt": "2026-10-26T15:30:11.373Z",
  "updatedAt": "2026-10-26T15:42:02.118Z",
  "actor": {
    "id": 7,
    "username": "Sara",
    "displayName": "Sara",
    "avatarUrl": null
  },
  "actorCount": 3,
  "entity": { "type": "post", "id": "42" },
  "data": {
    "postExcerpt": "Watch this…",
    "movieTitle": "Heat",
    "posterUrl": "/abc.jpg"
  },
  "roomId": null
}
```

`data` is a snapshot taken when the notification was created or last
updated, so it still renders if the post or room changes later. Fields by
type:

- `room_invite`: `roomName`, `roomImage`, `invitationId`, and `inviteToken` for
  email invitations
- `room_invite_approval`, `room_invite_accepted`, `room_invite_rejected`:
  `roomName`, `roomImage`, `invitationId`
- `movie_added`: `roomName`, `roomImage`, `movieTitle`, `posterUrl`
- `chat_mention`: `roomName`, `messageExcerpt`, `reason`
- `post_liked`: `postExcerpt`, plus `movieTitle` and `posterUrl` when the
  post has a movie and `roomName` when it is a room post
- `post_commented`: the same as `post_liked`, plus `commentExcerpt` (latest
  comment)

`entity.id` is always a string, because movie IDs are UUIDs and other IDs are
integers. `roomId` is the room to open for room-related notifications, or
`null`. `posterUrl` is a TMDb image path, the same as `poster_path`
elsewhere. Users have a single name today, so `displayName` equals
`username`.

## Endpoints

All routes need a bearer access token and only see the current user's
notifications.

| Method | Route                         | Purpose                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------ |
| GET    | `/notifications`              | Newest activity first; `cursor`, `limit` (≤50, default 20), `unreadOnly` |
| GET    | `/notifications/unread-count` | `{ "count": n }` for the badge                                           |
| POST   | `/notifications/read`         | `{ "ids": [..] }` or `{ "all": true }` → `{ "updated": n }`              |
| DELETE | `/notifications/:id`          | Delete one; 204                                                          |

- Page with `cursor=<nextCursor>` until `nextCursor` is `null`. Cursors are
  opaque strings.
- Poll `unread-count` every 30–60 seconds while the tab is visible. It reads
  one small index.
- `POST /notifications/read` needs exactly one of `ids` (up to 100) or
  `all: true`. Already-read and unknown IDs are ignored and do not count in
  `updated`. Marking read does not change the list order.

## Lifecycle

- Deleting a post or room deletes its notifications. Deleting a chat message
  deletes its mention notifications. Unlikes and deleted comments leave
  notifications in place.
- Read notifications older than 90 days are deleted nightly at 03:00 server
  time. Unread notifications are kept.

## Chat unread

- `GET /rooms` items include `unreadCount`: other people's undeleted chat
  messages after your read position. It is `0` in rooms you are not part of.
- `POST /rooms/:id/read` marks the room chat read up to its latest message
  and returns the same shape as `GET /rooms/:id/chat/unread`. Use it when you
  don't have the newest message ID; otherwise `PUT /rooms/:id/chat/read`
  still works.

## Database

One `notification` table. Apply the migration with the existing runner. In
PowerShell, call the script directly because PowerShell drops `--`:

```powershell
npm run build; if ($?) { node scripts/migrate-community.cjs --apply }
```
