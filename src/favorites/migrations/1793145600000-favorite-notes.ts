import { MigrationInterface, QueryRunner } from 'typeorm';

// An optional public note on each favorite movie.
export class FavoriteNotes1793145600000 implements MigrationInterface {
  name = 'FavoriteNotes1793145600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "favorite_movie" ADD COLUMN "note" varchar(280)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "favorite_movie" DROP COLUMN "note"');
  }
}
