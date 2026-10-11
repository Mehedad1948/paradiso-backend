import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoomThemeColor1791676800000 implements MigrationInterface {
  name = 'RoomThemeColor1791676800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "room" ADD COLUMN IF NOT EXISTS "themeColor" varchar(7)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "room" DROP COLUMN IF EXISTS "themeColor"',
    );
  }
}
