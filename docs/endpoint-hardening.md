# Endpoint behavior and deployment

Movie, room, rating, and invitation routes now validate identifiers and inputs, enforce room visibility and membership, and keep related database writes atomic. No changes have been applied to the application's existing database rows. PostgreSQL integration tests create and remove a separate, randomly named schema.

## Access rules

| Operation | Required access |
| --- | --- |
| Browse local movies and TMDb | Public |
| Create a local movie | Authenticated user |
| Update a local movie | Movie creator or admin |
| List rooms | Authenticated; only public rooms and the caller's rooms |
| Read a room or its ratings | Authenticated; public room, member, or owner |
| Join through `/rooms/join` | Authenticated; public room; caller joins themselves |
| Add movies or rate them | Room member or owner, including for public rooms |
| Remove a movie | Room member who created the catalogue movie, room owner, or member with admin role |
| Create/list/update/delete invite links | Room owner; link must belong to the room in the URL |
| Send/list email invitations | Room owner |
| Preview an invite link | Public; returns limited room and inviter information |
| Accept an invite link | Authenticated; active, unexpired link with available capacity |
| Accept an email invitation | Authenticated, verified recipient; active invitation and matching email |
| Change genres or create roles | Admin |

Invite-link acceptance adds room membership and increments usage in one transaction. Repeated acceptance by an existing member does not consume another use. Expired/inactive links remain invalid. Room-level locks serialize membership, movie-removal, and rating writes; link row locks protect capacity and updates.

Global rating routes include ratings only from public rooms or rooms the caller owns or belongs to. Their `users` list contains raters represented on the returned page, rather than all users who have ever rated a movie. Room matrices include every current room member and preserve missing votes as `null`.

## Client changes

- Previously issued access, refresh, and email-invitation JWTs must be replaced. Tokens now carry distinct purposes (`access`, `refresh`, `room-invitation`); users must sign in again after deployment. Existing UUID invite links remain valid.
- `POST /rooms/join` accepts `{ "roomId": 1 }`. A legacy `userId` is accepted but ignored; identity comes from authentication.
- `PUT /movies/:uuid` accepts partial updates using persisted field names, including `release_date` and `poster_path`. The catalogue `dbId` and relations cannot be changed through this endpoint. JSON numbers and booleans must have their actual JSON types.
- Genre input remains objects, for example `genres: [{ "id": 28, "name": "Action" }]`, where `id` is the TMDb genre ID.
- `POST /rooms/:roomId/invite-links` accepts optional `maxUsage` (zero means unlimited) and `expiresAt` (ISO timestamp). The URL supplies `roomId`.
- `PATCH /rooms/:roomId/invite-links/:id` updates `isActive`, `maxUsage`, or `expiresAt`.
- `POST /invite-links/verify/:uuid` requires authentication and actually joins the room. Its response contains `room: { id, name }` and a message.
- `POST /room-invitations/accept` accepts `{ "token": "<email invitation JWT>" }` with a bearer access token for the verified recipient. The frontend invitation page must call this route after sign-in/verification.
- Failed email delivery returns 503 and permits retry. Pending invitations can be resent after the configured invitation TTL. Resent invitations invalidate the earlier version.
- Array and primitive responses now use `{ "data": ..., "apiVersion": ... }`. Object responses retain their existing fields plus `apiVersion`; secret fields are excluded from nested user entities.
- Pagination accepts positive integer pages (up to 1,000,000) and limits from 1 to 100. Pagination links retain filters and use page 1 as the last page of an empty result.
- Rating filters support `search`, `isWatchTogether=true|false`, `startDate`/`endDate` on movie creation time, and `sortBy=rate|userRate` with `sortOrder=asc|desc`. `userRate` requires a numeric `sortByUserId`. Dates and sort order are applied consistently to counts and data.
- TMDb requests time out after five seconds. Missing movies return 404; upstream failures return 502, saturation returns 503, and timeouts return 504. TMDb search validates `query` and pages 1 through 500.
- Google sign-in was an unimplemented stub. It now returns 501 instead of an empty successful response.

## Deployment

1. Configure `NODE_ENV=production`, database credentials/host, JWT settings, mail settings, `PRODUCT_BASE_URL`, `TMDB_API_KEY`, and the existing required application settings. `TMDB_BASE_URL` defaults to `https://api.themoviedb.org/3` and must use HTTPS. Keep secrets outside version control.
2. Keep `DATABASE_SYNCHRONIZE=false` in production. Production startup rejects `true` and configuration also disables synchronization defensively. Entities load automatically, and `DATABASE_HOST` is now honored. Schema creation/upgrades must be managed separately; this repository's additive index SQL assumes the existing tables already exist.
3. Apply `database/endpoint-indexes.sql` to the intended application schema using your database deployment process. Run it outside a transaction because it uses `CREATE INDEX CONCURRENTLY`. It adds indexes for room ratings, recent movies, invitations, invite links, and case-insensitive email lookup. Inspect invalid indexes after an interrupted build before retrying. The script has been prepared for review, not applied to an existing application schema.
4. Build with `npm run build`, then start the compiled application with `npm run start:prod`. Set `NODE_ENV` in the service environment. Source imports are relative so the compiled application does not depend on TypeScript path aliases. Shutdown hooks are enabled.
5. Coordinate the frontend changes above, require a fresh sign-in, and replace old email invitations. Rotate the TMDb key that was previously hardcoded in the genre provider; it has been removed from the source, but existing history may contain it.

## Verification

```powershell
rtk npm run build
rtk npm test -- --runInBand
rtk npm run test:e2e -- --runInBand
rtk npm run test:db
rtk npm run lint
```

The database suite loads `.env.development` plus environment overrides, requires a local PostgreSQL host, and uses a temporary schema. It exercises the full Nest module graph, real HTTP guards/validation, actual PostgreSQL queries, concurrent ratings/link redemption, invite acceptance, mail failure recovery, and room-specific movie removal. Mail is mocked and catalogue movies are seeded to avoid external calls. The regular unit and HTTP boundary suites need no database.

## Remaining operational requirements

These endpoint changes do not establish an infrastructure-wide production guarantee. Configure HTTPS, backups, monitoring, and distributed request limits at the ingress, especially for authentication, mail-sending, and public TMDb proxy routes. Verify real SMTP and TMDb integration in staging. Email delivery is synchronous and can have ambiguous outcomes if a process crashes after sending; a durable mail outbox would be needed for guaranteed delivery/retry semantics. Refresh tokens are purpose-separated but do not yet have server-side rotation/revocation storage. Existing `isWatchedTogether` state and movie attribution belong to the shared catalogue; room-specific watch state or per-room attribution requires a separate membership entity and data migration.
