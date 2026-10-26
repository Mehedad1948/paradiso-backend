import { MigrationInterface, QueryRunner } from 'typeorm';

// In-app notifications for the header bell.
export class Notifications1792972800000 implements MigrationInterface {
  name = 'Notifications1792972800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "recipientId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "type" varchar(32) NOT NULL,
        "actorId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "actorCount" integer NOT NULL DEFAULT 1,
        "entityType" varchar(16) NOT NULL,
        "entityId" varchar(64) NOT NULL,
        "roomId" integer REFERENCES "room"("id") ON DELETE CASCADE,
        "postId" integer REFERENCES "community_post"("id") ON DELETE CASCADE,
        "data" jsonb NOT NULL DEFAULT '{}',
        "groupKey" varchar(128),
        "readAt" timestamptz,
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_notification_type" CHECK ("type" IN ('room_invite', 'movie_added', 'chat_mention', 'post_liked', 'post_commented')),
        CONSTRAINT "CHK_notification_entity_type" CHECK ("entityType" IN ('room', 'post', 'movie', 'message'))
      );
      CREATE INDEX "IDX_notification_recipient_updated" ON "notification" ("recipientId", "updatedAt", "id");
      CREATE INDEX "IDX_notification_recipient_unread" ON "notification" ("recipientId", "updatedAt", "id") WHERE "readAt" IS NULL;
      CREATE UNIQUE INDEX "UQ_notification_recipient_group" ON "notification" ("recipientId", "groupKey") WHERE "readAt" IS NULL AND "groupKey" IS NOT NULL;
      CREATE INDEX "IDX_notification_read_at" ON "notification" ("readAt") WHERE "readAt" IS NOT NULL;
      CREATE INDEX "IDX_notification_room_id" ON "notification" ("roomId") WHERE "roomId" IS NOT NULL;
      CREATE INDEX "IDX_notification_post_id" ON "notification" ("postId") WHERE "postId" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "notification"');
  }
}
