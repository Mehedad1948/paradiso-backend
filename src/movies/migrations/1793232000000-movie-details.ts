import { MigrationInterface, QueryRunner } from 'typeorm';

// Details-screen data stored with each catalogue movie. Existing rows keep
// "detailsFetchedAt" null and are filled from TMDb the first time they open.
export class MovieDetails1793232000000 implements MigrationInterface {
  name = 'MovieDetails1793232000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "movie"
        ADD COLUMN "runtime" integer,
        ADD COLUMN "tagline" varchar,
        ADD COLUMN "backdrop_path" varchar,
        ADD COLUMN "director" varchar,
        ADD COLUMN "cast" jsonb,
        ADD COLUMN "trailerKey" varchar(32),
        ADD COLUMN "detailsFetchedAt" timestamptz`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "movie"
        DROP COLUMN "detailsFetchedAt",
        DROP COLUMN "trailerKey",
        DROP COLUMN "cast",
        DROP COLUMN "director",
        DROP COLUMN "backdrop_path",
        DROP COLUMN "tagline",
        DROP COLUMN "runtime"`,
    );
  }
}
