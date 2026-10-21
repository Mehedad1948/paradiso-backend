import { MigrationInterface, QueryRunner } from 'typeorm';

// Ratings accept one decimal place (e.g. 7.5). Existing integers convert as-is.
export class DecimalRatings1792454400000 implements MigrationInterface {
  name = 'DecimalRatings1792454400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "rating" ALTER COLUMN "rate" TYPE numeric(3,1) USING "rate"::numeric(3,1)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: decimal ratings are rounded to the nearest integer.
    await queryRunner.query(
      'ALTER TABLE "rating" ALTER COLUMN "rate" TYPE integer USING round("rate")::integer',
    );
  }
}
