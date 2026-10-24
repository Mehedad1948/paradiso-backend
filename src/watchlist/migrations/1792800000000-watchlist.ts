import { MigrationInterface, QueryRunner } from 'typeorm';

// Movies a user saved to watch later.
export class Watchlist1792800000000 implements MigrationInterface {
  name = 'Watchlist1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "watchlist_item" (
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "movieId" uuid NOT NULL REFERENCES "movie"("id") ON DELETE CASCADE,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "movieId")
      );
      CREATE INDEX "IDX_watchlist_item_user_created" ON "watchlist_item" ("userId", "createdAt");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "watchlist_item"');
  }
}
