import { MigrationInterface, QueryRunner } from 'typeorm';

// Profile invitations: invitations can target a user id, need owner approval in
// private rooms, and expire. The status enum becomes varchar + CHECK because new
// enum values cannot be used in the transaction that adds them.
export class RoomUserInvitations1793059200000 implements MigrationInterface {
  name = 'RoomUserInvitations1793059200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "room_invitation" RENAME COLUMN "invitedById" TO "inviterId";
      ALTER TABLE "room_invitation" ALTER COLUMN "email" DROP NOT NULL;
      ALTER TABLE "room_invitation" DROP CONSTRAINT "UQ_31a34814d3264e21e9fdf2a2775";
      ALTER TABLE "room_invitation"
        ADD COLUMN "inviteeUserId" integer REFERENCES "user"("id") ON DELETE CASCADE,
        ADD COLUMN "reviewedById" integer REFERENCES "user"("id") ON DELETE SET NULL,
        ADD COLUMN "reviewedAt" timestamptz,
        ADD COLUMN "respondedAt" timestamptz,
        ADD COLUMN "pendingAt" timestamptz,
        ADD COLUMN "expiresAt" timestamptz;
      ALTER TABLE "room_invitation" ALTER COLUMN "status" DROP DEFAULT;
      ALTER TABLE "room_invitation" ALTER COLUMN "status" TYPE varchar(20) USING "status"::text;
      ALTER TABLE "room_invitation" ALTER COLUMN "status" SET DEFAULT 'pending';
      DROP TYPE "room_invitation_status_enum";
      ALTER TABLE "room_invitation" ADD CONSTRAINT "CHK_room_invitation_status"
        CHECK ("status" IN ('awaiting_approval', 'pending', 'accepted', 'declined', 'rejected', 'cancelled', 'expired'));

      UPDATE "room_invitation" i SET "inviteeUserId" = u."id"
        FROM "user" u WHERE lower(u."email") = lower(i."email");
      UPDATE "room_invitation" SET
        "pendingAt" = "createdAt"::timestamptz,
        "expiresAt" = "createdAt"::timestamptz + interval '14 days';
      ALTER TABLE "room_invitation" ALTER COLUMN "expiresAt" SET NOT NULL;

      CREATE UNIQUE INDEX "UQ_room_invitation_open_invitee" ON "room_invitation" ("roomId", "inviteeUserId")
        WHERE "status" IN ('awaiting_approval', 'pending');
      CREATE UNIQUE INDEX "UQ_room_invitation_open_email" ON "room_invitation" ("roomId", "email")
        WHERE "email" IS NOT NULL AND "status" IN ('awaiting_approval', 'pending');
      CREATE INDEX "IDX_room_invitation_invitee_created" ON "room_invitation" ("inviteeUserId", "createdAt", "id")
        WHERE "inviteeUserId" IS NOT NULL;
      CREATE INDEX "IDX_room_invitation_inviter_created" ON "room_invitation" ("inviterId", "createdAt");
      CREATE INDEX "IDX_room_invitation_open_expiry" ON "room_invitation" ("expiresAt")
        WHERE "status" IN ('awaiting_approval', 'pending');

      ALTER TABLE "user" ADD COLUMN "roomInvitePolicy" varchar(10) NOT NULL DEFAULT 'everyone';
      ALTER TABLE "user" ADD CONSTRAINT "CHK_user_room_invite_policy"
        CHECK ("roomInvitePolicy" IN ('everyone', 'following', 'nobody'));

      ALTER TABLE "notification" DROP CONSTRAINT "CHK_notification_type";
      ALTER TABLE "notification" ADD CONSTRAINT "CHK_notification_type" CHECK ("type" IN (
        'room_invite', 'room_invite_approval', 'room_invite_accepted', 'room_invite_rejected',
        'movie_added', 'chat_mention', 'post_liked', 'post_commented'));
    `);
  }

  // Lossy: user-id invitations without an email, and the new statuses, are folded away.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "notification" WHERE "type" IN ('room_invite_approval', 'room_invite_accepted', 'room_invite_rejected');
      ALTER TABLE "notification" DROP CONSTRAINT "CHK_notification_type";
      ALTER TABLE "notification" ADD CONSTRAINT "CHK_notification_type" CHECK ("type" IN (
        'room_invite', 'movie_added', 'chat_mention', 'post_liked', 'post_commented'));

      ALTER TABLE "user" DROP CONSTRAINT "CHK_user_room_invite_policy";
      ALTER TABLE "user" DROP COLUMN "roomInvitePolicy";

      DROP INDEX "IDX_room_invitation_open_expiry";
      DROP INDEX "IDX_room_invitation_inviter_created";
      DROP INDEX "IDX_room_invitation_invitee_created";
      DROP INDEX "UQ_room_invitation_open_email";
      DROP INDEX "UQ_room_invitation_open_invitee";

      DELETE FROM "room_invitation" WHERE "email" IS NULL;
      DELETE FROM "room_invitation" i USING "room_invitation" j
        WHERE i."email" = j."email" AND i."roomId" = j."roomId" AND i."id" < j."id";
      UPDATE "room_invitation" SET "status" = 'expired'
        WHERE "status" IN ('awaiting_approval', 'rejected', 'cancelled');
      ALTER TABLE "room_invitation" DROP CONSTRAINT "CHK_room_invitation_status";
      CREATE TYPE "room_invitation_status_enum" AS ENUM('pending', 'accepted', 'declined', 'expired');
      ALTER TABLE "room_invitation" ALTER COLUMN "status" DROP DEFAULT;
      ALTER TABLE "room_invitation" ALTER COLUMN "status" TYPE "room_invitation_status_enum"
        USING "status"::"room_invitation_status_enum";
      ALTER TABLE "room_invitation" ALTER COLUMN "status" SET DEFAULT 'pending';

      ALTER TABLE "room_invitation"
        DROP COLUMN "expiresAt", DROP COLUMN "pendingAt", DROP COLUMN "respondedAt",
        DROP COLUMN "reviewedAt", DROP COLUMN "reviewedById", DROP COLUMN "inviteeUserId";
      ALTER TABLE "room_invitation" ALTER COLUMN "email" SET NOT NULL;
      ALTER TABLE "room_invitation" ADD CONSTRAINT "UQ_31a34814d3264e21e9fdf2a2775" UNIQUE ("email", "roomId");
      ALTER TABLE "room_invitation" RENAME COLUMN "inviterId" TO "invitedById";
    `);
  }
}
