import { MigrationInterface, QueryRunner } from 'typeorm';

// TMDb movies and people kept off the site; filled by
// scripts/audit-adult-content.cjs and checked on every TMDb-facing read.
export class ContentBlocks1793750400000 implements MigrationInterface {
  name = 'ContentBlocks1793750400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "content_block" (
        "id" SERIAL NOT NULL,
        "kind" character varying(16) NOT NULL,
        "tmdbId" integer NOT NULL,
        "source" character varying(16) NOT NULL,
        "label" character varying,
        "reason" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_content_block_kind_tmdbId" UNIQUE ("kind", "tmdbId"),
        CONSTRAINT "PK_content_block" PRIMARY KEY ("id")
      )`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "content_block"');
  }
}
