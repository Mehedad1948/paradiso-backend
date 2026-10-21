import { MigrationInterface, QueryRunner } from 'typeorm';

// Posts no longer need a movie or rating, can quote or repost another post,
// and can be liked or disliked.
export class PostReactionsReposts1792540800000 implements MigrationInterface {
  name = 'PostReactionsReposts1792540800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "community_post" ALTER COLUMN "movieId" DROP NOT NULL;
      ALTER TABLE "community_post" ALTER COLUMN "rating" DROP NOT NULL;
      ALTER TABLE "community_post" ALTER COLUMN "text" TYPE varchar(4000);
      ALTER TABLE "community_post" ADD COLUMN "quotedPostId" integer
        REFERENCES "community_post"("id") ON DELETE SET NULL;
      CREATE INDEX "IDX_community_post_quoted_post_id" ON "community_post" ("quotedPostId");
      CREATE UNIQUE INDEX "UQ_community_post_repost" ON "community_post" ("authorId", "quotedPostId") WHERE "text" = '';
      CREATE TABLE "community_post_reaction" (
        "postId" integer NOT NULL REFERENCES "community_post"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "value" smallint NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("postId", "userId"),
        CONSTRAINT "CHK_community_post_reaction_value" CHECK ("value" IN (1, -1))
      );
      CREATE INDEX "IDX_community_post_reaction_post_value" ON "community_post_reaction" ("postId", "value");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: posts without a movie or rating, and all reposts, are removed.
    await queryRunner.query(`
      DROP TABLE "community_post_reaction";
      DELETE FROM "community_post" WHERE "movieId" IS NULL OR "rating" IS NULL OR "text" = '';
      DROP INDEX "UQ_community_post_repost";
      DROP INDEX "IDX_community_post_quoted_post_id";
      ALTER TABLE "community_post" DROP COLUMN "quotedPostId";
      ALTER TABLE "community_post" ALTER COLUMN "rating" SET NOT NULL;
      ALTER TABLE "community_post" ALTER COLUMN "movieId" SET NOT NULL;
    `);
  }
}
