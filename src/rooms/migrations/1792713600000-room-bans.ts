import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoomBans1792713600000 implements MigrationInterface {
  name = 'RoomBans1792713600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "room_ban" (
        "id" SERIAL PRIMARY KEY,
        "roomId" integer NOT NULL REFERENCES "room"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "bannedById" integer REFERENCES "user"("id") ON DELETE SET NULL,
        "reason" varchar(500),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_room_ban_room_user" UNIQUE ("roomId", "userId")
      );
      CREATE INDEX "IDX_room_ban_user" ON "room_ban" ("userId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "room_ban"');
  }
}
