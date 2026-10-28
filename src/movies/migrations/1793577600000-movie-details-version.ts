import { MigrationInterface, QueryRunner } from 'typeorm';

// Marks which version of the details code filled each row. Resetting
// "detailsFetchedAt" for the gallery raced the deploy: the previous build
// refilled rows without a gallery and stamped them as done. Only rows that
// already hold a gallery count as current; the rest refresh on next view or
// through scripts/backfill-movie-details.cjs.
export class MovieDetailsVersion1793577600000 implements MigrationInterface {
  name = 'MovieDetailsVersion1793577600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "movie" ADD COLUMN "detailsVersion" smallint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'UPDATE "movie" SET "detailsVersion" = 1 WHERE "detailsFetchedAt" IS NOT NULL AND "backdrops" IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "movie" DROP COLUMN "detailsVersion"');
  }
}
