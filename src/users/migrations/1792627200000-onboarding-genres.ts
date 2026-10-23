import { MigrationInterface, QueryRunner } from 'typeorm';

// Optional post-signup onboarding: favorite genres and a completion timestamp.
export class OnboardingGenres1792627200000 implements MigrationInterface {
  name = 'OnboardingGenres1792627200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN "onboardedAt" timestamp with time zone;
      -- The user table has no createdAt, so existing accounts are marked as
      -- onboarded at migration time and never see the onboarding step.
      UPDATE "user" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;
      CREATE TABLE "user_genres" (
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "genreId" uuid NOT NULL REFERENCES "genre"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY ("userId", "genreId")
      );
      CREATE INDEX "IDX_user_genres_genre_id" ON "user_genres" ("genreId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "user_genres";
      ALTER TABLE "user" DROP COLUMN "onboardedAt";
    `);
  }
}
