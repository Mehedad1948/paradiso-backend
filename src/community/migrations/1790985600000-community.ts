import { MigrationInterface, QueryRunner } from 'typeorm';

export class Community1790985600000 implements MigrationInterface {
  name = 'Community1790985600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "community_post" (
        "id" SERIAL PRIMARY KEY,
        "authorId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "movieId" uuid NOT NULL REFERENCES "movie"("id") ON DELETE CASCADE,
        "text" varchar(4000) NOT NULL,
        "rating" double precision NOT NULL,
        "imageUrl" varchar(2048),
        "roomId" integer REFERENCES "room"("id") ON DELETE CASCADE,
        "promotedInviteId" integer REFERENCES "room_invite_link"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_community_post_rating" CHECK ("rating" >= 0 AND "rating" <= 10)
      );
      CREATE INDEX "IDX_community_post_author_id" ON "community_post" ("authorId", "id");
      CREATE INDEX "IDX_community_post_room_id" ON "community_post" ("roomId", "id");
      CREATE TABLE "community_comment" (
        "id" SERIAL PRIMARY KEY,
        "postId" integer NOT NULL REFERENCES "community_post"("id") ON DELETE CASCADE,
        "authorId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "text" varchar(2000) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_community_comment_post_id" ON "community_comment" ("postId", "id");
      CREATE TABLE "user_follow" (
        "followerId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "followingId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("followerId", "followingId"),
        CONSTRAINT "CHK_user_follow_not_self" CHECK ("followerId" <> "followingId")
      );
      CREATE INDEX "IDX_user_follow_following_follower" ON "user_follow" ("followingId", "followerId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "community_comment", "user_follow", "community_post"',
    );
  }
}
