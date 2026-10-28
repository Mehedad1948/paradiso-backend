import { MigrationInterface, QueryRunner } from 'typeorm';

// A backdrop gallery for the details screen. Catalogue movies filled before
// it existed are marked unfetched, so their next view stores the gallery.
export class MovieBackdrops1793491200000 implements MigrationInterface {
  name = 'MovieBackdrops1793491200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "movie" ADD COLUMN "backdrops" jsonb');
    await queryRunner.query(
      'UPDATE "movie" SET "detailsFetchedAt" = NULL WHERE "dbId" IS NOT NULL AND "detailsFetchedAt" IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "movie" DROP COLUMN "backdrops"');
  }
}
