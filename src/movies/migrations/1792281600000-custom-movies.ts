import { MigrationInterface, QueryRunner } from 'typeorm';

// Manually entered movies have no TMDb ID. The unique constraint on "dbId"
// still applies to catalogue movies; PostgreSQL allows any number of NULLs.
export class CustomMovies1792281600000 implements MigrationInterface {
  name = 'CustomMovies1792281600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "movie" ALTER COLUMN "dbId" DROP NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Irreversible while custom movies exist; remove them first.
    await queryRunner.query(
      'ALTER TABLE "movie" ALTER COLUMN "dbId" SET NOT NULL',
    );
  }
}
