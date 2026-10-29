import { MigrationInterface, QueryRunner } from 'typeorm';

// The featured artist of the day and the editors' boosts and blocks.
export class FeaturedArtists1793836800000 implements MigrationInterface {
  name = 'FeaturedArtists1793836800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "featured_artist" (
        "id" SERIAL NOT NULL,
        "feature_date" date NOT NULL,
        "tmdb_person_id" integer NOT NULL,
        "name" text NOT NULL,
        "profile_path" text NOT NULL,
        "known_for_department" text,
        "tagline" character varying(140),
        "source" character varying(8) NOT NULL,
        "created_by" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_featured_artist" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_featured_artist_feature_date" UNIQUE ("feature_date"),
        CONSTRAINT "CHK_featured_artist_source" CHECK ("source" IN ('auto', 'manual'))
      )`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_featured_artist_tmdb_person_id" ON "featured_artist" ("tmdb_person_id")',
    );
    await queryRunner.query(
      `CREATE TABLE "featured_candidate" (
        "tmdb_person_id" integer NOT NULL,
        "boost" numeric(4,2) NOT NULL DEFAULT 1,
        "blocked" boolean NOT NULL DEFAULT false,
        "note" character varying(500),
        "updated_by" integer NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_featured_candidate" PRIMARY KEY ("tmdb_person_id"),
        CONSTRAINT "CHK_featured_candidate_boost" CHECK ("boost" >= 0 AND "boost" <= 10)
      )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "featured_candidate"');
    await queryRunner.query('DROP TABLE "featured_artist"');
  }
}
