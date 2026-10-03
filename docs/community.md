# Movie community API

The community lets visitors discover movie recommendations and lets signed-in
users publish recommendations, comment, follow people and promote their rooms.
This repository implements the backend; the frontend can use the generated
`generated/api.d.ts` contract and `/docs` to build its feed, post composer,
profile and room discussion views.

## Access and visibility

- Reading the global feed, public posts, comments and profiles is anonymous.
- Creating, editing, deleting, following and commenting require the existing
  JWT access token. Send `Authorization: Bearer <accessToken>`.
- Posts without `roomId` are public. Posts in public rooms appear in the global
  feed and that room's feed. Posts in private rooms appear only in the room's
  feed, accessible to its members and owner. Global and following feeds always
  exclude private room posts, including for members.
- Only members and the owner may create room posts or comment on room posts.
  Anyone signed in may comment on posts without a room.
- Only the author may edit a post. The author or room owner may delete a room
  post. Comment authors, the post author and the room owner may delete comments.
- Public profiles contain only ID, username, avatar and follower counts.
  No email, password, verification code or role is included.
- A post's movie and room scope cannot be changed after creation.

## Endpoints

All routes are under `/community`. Successful responses include `apiVersion`.

| Method | Route                                | Purpose                                                          |
| ------ | ------------------------------------ | ---------------------------------------------------------------- |
| GET    | `/posts`                             | Public feed; optional `authorId` and `movieId` filters           |
| GET    | `/following`                         | Public posts by users the current user follows                   |
| GET    | `/rooms/:roomId/posts`               | Only posts scoped to that room                                   |
| GET    | `/posts/:postId`                     | A recommendation with movie, author, promotion and comment count |
| POST   | `/posts`                             | Publish a recommendation                                         |
| PATCH  | `/posts/:postId`                     | Edit text, rating or image URL                                   |
| DELETE | `/posts/:postId`                     | Delete a post and its comments                                   |
| GET    | `/posts/:postId/comments`            | List comments, newest first                                      |
| POST   | `/posts/:postId/comments`            | Comment with `{ "text": "..." }`                                 |
| DELETE | `/posts/:postId/comments/:commentId` | Delete a comment                                                 |
| GET    | `/users/:userId`                     | Public profile and follow counts                                 |
| PUT    | `/users/:userId/follow`              | Follow; repeated requests are safe                               |
| DELETE | `/users/:userId/follow`              | Unfollow; repeated requests are safe                             |
| GET    | `/users/:userId/followers`           | Public follower profiles                                         |
| GET    | `/users/:userId/following`           | Public profiles this person follows                              |

List routes accept `limit` (default 20, maximum 100) and `before`.
They return `{ "data": [...], "nextCursor": 123, "apiVersion": "..." }`.
Pass `nextCursor` as `before` for the next page; null means no further page.
Post and comment cursors are their IDs. Follow-list cursors are user IDs;
follow lists sort by user ID rather than follow time.

## Publishing

Choose or create a movie using the existing movie API. `movieId` is its local
UUID, rather than the numeric TMDB ID. Upload an image with the existing
authenticated `POST /uploads/file`, then use its `path` as `imageUrl`.
An omitted image uses the movie's poster path. The frontend should resolve
relative TMDB poster paths using its existing movie-image handling.

```json
{
  "movieId": "d9428888-122b-4d4e-8b25-269d48835b2a",
  "text": "Beautiful cinematography and a memorable ending.",
  "rating": 8.5,
  "imageUrl": "https://images.example.com/paradiso/movies/recommendation.jpg"
}
```

Ratings are personal scores from 0 to 10, with at most one decimal place;
they do not change the existing room rating system. Text is trimmed and must
contain 1–4000 characters; comments must contain 1–2000 characters. Image URLs
must use HTTPS. Render text as plain text in the frontend.

Add `roomId` to publish inside a room. There is no automatic membership change
or automatic addition of that movie to the room's movie list.

## Room promotion

The room owner creates a link using the existing
`POST /rooms/:roomId/invite-links` route, then includes its UUID token as
`promotedInviteToken` when publishing a recommendation. A public post may promote
a private room: this intentionally publishes the room's name and image as an
invitation teaser, while keeping its discussion private.

The post's `promotion` contains the room preview, `canJoin`, and a token only
while the link is active, unexpired and below its usage limit. Deleted links
remove the promotion. Publishing does not consume an invitation use.
Readers join through the existing authenticated `POST /invite-links/:token/verify`
route; its existing transaction and limits remain authoritative. Opening a
promotion does not bypass room permissions.

## Schema rollout and checks

Automatic schema synchronization stays disabled in production. The additive
TypeORM migration creates only `community_post`, `community_comment` and
`user_follow`, plus indexes and constraints. Foreign keys cascade comment
deletion when a post is deleted and clear promotions when invite links are
deleted. Existing user, room, movie and invitation data is retained.

```powershell
npm run community:migrate
```

This builds and prints the SQL without connecting. Test the migration on an
isolated database branch before production. With a direct connection set in
`DATABASE_URL_UNPOOLED` (or a direct `NEON_DB`/`DATABASE_URL`), apply once:

```powershell
npm run community:migrate -- --apply
```

The runner records the migration in `community_migrations` and executes it
transactionally. Do not combine this migration with automatic synchronization
or apply it to a database where synchronization already created these tables.
For a new empty database, the existing schema initializer discovers these
entities automatically; the separate community migration is for existing
databases.

Run `npm test -- --runInBand`, `npm run build`, `npm run api:check`, and
`npm run test:db` for the local PostgreSQL integration suite. The integration
suite creates and removes its own isolated schema; it never targets Neon
production. Community tests cover public reads, login requirements, private
room isolation, author permissions, follows, comments, validation and safe
serialization.
