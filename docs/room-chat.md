# Room chat API

Each room has a chat for its members: text messages with replies, @-mentions
of members, movie cards (room movies or any TMDb movie), emoji reactions,
polls, pinned messages and unread counts. Delivery is plain HTTP polling, so
there are no sockets or long-lived connections.

## Access

- Only room members and the owner can read or write the chat, even in public
  rooms. Everyone else gets 403.
- Only the author can edit a message. The author or the room owner can delete
  a message, pin or unpin it, and close its poll.
- Users can be mentioned only if they are room members or the owner. Movie
  cards with `movieId` and poll options with `movieId` must be movies in the
  room.
- Sending is limited to 10 messages per 10 seconds per user in a room. Going
  over returns 429.

## Endpoints

All routes are under `/rooms/:roomId/chat` and need a bearer access token.
Every mutation returns the full updated message.

| Method | Route                              | Purpose                                                  |
| ------ | ---------------------------------- | -------------------------------------------------------- |
| GET    | `/messages`                        | History, newest first; `limit` (≤100) and `before`       |
| GET    | `/messages/sync?since=`            | Messages created or changed since a cursor               |
| GET    | `/messages/:messageId`             | One message                                              |
| POST   | `/messages`                        | Send a message                                           |
| PATCH  | `/messages/:messageId`             | Edit text and mentions (author; not polls)               |
| DELETE | `/messages/:messageId`             | Delete; leaves a tombstone                               |
| PUT    | `/messages/:messageId/reactions`   | React with `{ "emoji": "🍿" }`; repeating is safe        |
| DELETE | `/messages/:messageId/reactions`   | Remove your reaction `{ "emoji": "🍿" }`                 |
| PUT    | `/messages/:messageId/poll/vote`   | `{ "optionIds": [..] }` replaces your votes; `[]` clears |
| POST   | `/messages/:messageId/poll/close`  | Close a poll                                             |
| PUT    | `/messages/:messageId/pin`         | Pin                                                      |
| DELETE | `/messages/:messageId/pin`         | Unpin                                                    |
| GET    | `/pinned`                          | Pinned messages, newest pin first                        |
| GET    | `/unread`                          | `unreadCount`, `mentionCount`, read position             |
| PUT    | `/read`                            | `{ "messageId": n }` marks read up to n                  |

### Sending

```json
{
  "text": "@Sara Friday?",
  "replyToId": 41,
  "mentionedUserIds": [7],
  "movies": [{ "movieId": "<room movie uuid>" }, { "tmdbId": 603 }],
  "poll": {
    "options": [{ "movieId": "<room movie uuid>" }, { "text": "Something new" }],
    "allowsMultiple": false,
    "anonymous": false,
    "closesAt": "2026-10-20T18:00:00Z"
  }
}
```

Every field is optional, but a message needs at least text, a movie or a poll.
A poll needs `text` as its question and 2–10 options. An option with a
`movieId` takes the movie's title unless `text` is given. A message can carry
up to 5 movie cards; each one has exactly one of `movieId` or `tmdbId`.

The server stores each movie card's `title`, `year` and `posterPath`, so the
card still renders if the movie later changes. A `tmdbId` for a movie that is
already in the room is linked to it (`movieId` is set); otherwise `movieId` is
null and the card shows only TMDb details. `posterPath` is a TMDb image path,
the same as `poster_path` elsewhere.

`mentionedUserIds` is the source of truth for mentions; the `@name` text is
only for display. Editing replaces mentions only when `mentionedUserIds` is
sent.

### Message shape

A message has `text`, `author`, `replyTo` (a short preview: `id`, the first 200
characters of `text`, `author`, `deleted`), `mentions`, `movies`, `reactions`
(`emoji`, `count`, `reactedByMe`, `userIds`) and `poll` (`options` with `votes`,
`votedByMe`, `voterIds`; `voterIds` is empty for anonymous polls, plus
`isClosed` and `totalVoters`). It also has `pinnedAt`, `pinnedById`,
`editedAt`, `deletedAt`, `createdAt` and `updatedAt`. Resolve `userIds`,
`voterIds` and `pinnedById` against the room members from `GET /rooms/:id`.

A deleted message keeps its `id`, `author`, timestamps and position, with
`text: null` and no mentions, movies, reactions, poll or pin. Show it as
"message deleted". Replies to it show `replyTo.deleted: true`.

## Live updates

1. Load the latest page with `GET /messages`. Keep the time you loaded it.
2. While the chat is open and the tab is visible, call
   `GET /messages/sync?since=<cursor>` every 3–5 seconds. Use your load time
   for the first call, then the `cursor` from each response.
3. Upsert each returned message by `id`: new messages, edits, deletions,
   reactions, votes and pins all come through this one call. While `hasMore`
   is true, call again at once.
4. Stop polling when the chat is hidden, and back off to 15–30 seconds when
   the room is quiet. Polling keeps the Neon database awake.

The cursor runs a few seconds behind the database clock, so the same message
can come back more than once. Upserting by `id` makes that harmless. The
preview in `replyTo` is not refreshed when the original is later edited, so
prefer the original from your local list when you have it.

## Unread counts

`GET /unread` counts other people's undeleted messages after your read
position, and how many of them mention you. Call `PUT /read` with the newest
visible message ID when the user views the chat. The read position only moves
forward.

`GET /rooms` also returns `unreadCount` per room, and `POST /rooms/:id/read`
marks everything up to the latest message read. See
[notifications.md](notifications.md#chat-unread).

## Database

The chat adds eight tables, all prefixed `room_message`, `room_poll` or
`room_chat_read`. They delete with their room. Apply the migration with the
existing runner. In PowerShell, call the script directly because PowerShell
drops `--`:

```powershell
npm run build; if ($?) { node scripts/migrate-community.cjs --apply }
```
