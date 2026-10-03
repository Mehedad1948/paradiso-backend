-- Apply to the existing application schema before deploying the endpoint changes.
-- Run outside a transaction: CONCURRENTLY keeps reads and writes available.
-- No rows are changed. If a concurrent index build fails, inspect and drop its
-- invalid index before retrying; IF NOT EXISTS does not repair invalid indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_rating_room_movie" ON "rating" ("roomId", "movieId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_movie_created_id" ON "movie" ("createdAt" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_invite_link_room_created" ON "room_invite_link" ("roomId", "createdAt" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_invitation_room_created" ON "room_invitation" ("roomId", "createdAt" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_email_lower" ON "user" (LOWER("email"));
