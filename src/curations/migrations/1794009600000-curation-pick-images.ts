import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets an editors' pick carry its own cover image (a TMDb poster other than the
// movie's default). The original check kept image_url and object_position to
// the landing grid; now only object_position stays grid-only.
export class CurationPickImages1794009600000 implements MigrationInterface {
  name = 'CurationPickImages1794009600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "curation_item" DROP CONSTRAINT "CHK_curation_item_grid_only"',
    );
    await queryRunner.query(
      `ALTER TABLE "curation_item" ADD CONSTRAINT "CHK_curation_item_grid_only" CHECK ("curation_key" = 'landing-grid' OR "object_position" IS NULL)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // The old rule cannot hold while picks carry images, so they are dropped.
    await queryRunner.query(
      `UPDATE "curation_item" SET "image_url" = NULL WHERE "curation_key" <> 'landing-grid'`,
    );
    await queryRunner.query(
      'ALTER TABLE "curation_item" DROP CONSTRAINT "CHK_curation_item_grid_only"',
    );
    await queryRunner.query(
      `ALTER TABLE "curation_item" ADD CONSTRAINT "CHK_curation_item_grid_only" CHECK ("curation_key" = 'landing-grid' OR ("image_url" IS NULL AND "object_position" IS NULL))`,
    );
  }
}
