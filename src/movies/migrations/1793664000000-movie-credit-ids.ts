import { MigrationInterface, QueryRunner } from 'typeorm';

// Person IDs for the details screen's credits, so names link to person
// pages. Existing rows refresh on next view (DETAILS_VERSION 2) or through
// scripts/backfill-movie-details.cjs; their stored cast has no IDs until then.
export class MovieCreditIds1793664000000 implements MigrationInterface {
  name = 'MovieCreditIds1793664000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "movie" ADD COLUMN "directors" jsonb, ADD COLUMN "crew" jsonb',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "movie" DROP COLUMN "crew", DROP COLUMN "directors"',
    );
  }
}
