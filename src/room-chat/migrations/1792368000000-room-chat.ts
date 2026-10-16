import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoomChat1792368000000 implements MigrationInterface {
  name = 'RoomChat1792368000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "room_message" (
        "id" SERIAL PRIMARY KEY,
        "roomId" integer NOT NULL REFERENCES "room"("id") ON DELETE CASCADE,
        "authorId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "text" varchar(2000),
        "replyToId" integer REFERENCES "room_message"("id") ON DELETE SET NULL,
        "pinnedAt" timestamptz,
        "pinnedById" integer REFERENCES "user"("id") ON DELETE SET NULL,
        "editedAt" timestamptz,
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_room_message_room_id" ON "room_message" ("roomId", "id");
      CREATE INDEX "IDX_room_message_room_updated" ON "room_message" ("roomId", "updatedAt");
      CREATE INDEX "IDX_room_message_author_created" ON "room_message" ("authorId", "createdAt");
      CREATE INDEX "IDX_room_message_reply_to" ON "room_message" ("replyToId");
      CREATE TABLE "room_message_mention" (
        "messageId" integer NOT NULL REFERENCES "room_message"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        PRIMARY KEY ("messageId", "userId")
      );
      CREATE INDEX "IDX_room_message_mention_user" ON "room_message_mention" ("userId", "messageId");
      CREATE TABLE "room_message_movie" (
        "id" SERIAL PRIMARY KEY,
        "messageId" integer NOT NULL REFERENCES "room_message"("id") ON DELETE CASCADE,
        "position" smallint NOT NULL,
        "movieId" uuid REFERENCES "movie"("id") ON DELETE SET NULL,
        "tmdbId" integer,
        "title" varchar(255) NOT NULL,
        "year" varchar(4),
        "posterPath" varchar(255)
      );
      CREATE INDEX "IDX_room_message_movie_message" ON "room_message_movie" ("messageId", "position");
      CREATE TABLE "room_message_reaction" (
        "messageId" integer NOT NULL REFERENCES "room_message"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "emoji" varchar(32) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("messageId", "userId", "emoji")
      );
      CREATE TABLE "room_chat_read" (
        "roomId" integer NOT NULL REFERENCES "room"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "lastReadMessageId" integer NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("roomId", "userId")
      );
      CREATE TABLE "room_poll" (
        "messageId" integer PRIMARY KEY REFERENCES "room_message"("id") ON DELETE CASCADE,
        "allowsMultiple" boolean NOT NULL DEFAULT false,
        "anonymous" boolean NOT NULL DEFAULT false,
        "closesAt" timestamptz,
        "closedAt" timestamptz
      );
      CREATE TABLE "room_poll_option" (
        "id" SERIAL PRIMARY KEY,
        "messageId" integer NOT NULL REFERENCES "room_poll"("messageId") ON DELETE CASCADE,
        "position" smallint NOT NULL,
        "text" varchar(200) NOT NULL,
        "movieId" uuid REFERENCES "movie"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_room_poll_option_message" ON "room_poll_option" ("messageId", "position");
      CREATE TABLE "room_poll_vote" (
        "optionId" integer NOT NULL REFERENCES "room_poll_option"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "messageId" integer NOT NULL REFERENCES "room_poll"("messageId") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("optionId", "userId")
      );
      CREATE INDEX "IDX_room_poll_vote_message_user" ON "room_poll_vote" ("messageId", "userId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "room_poll_vote", "room_poll_option", "room_poll", "room_chat_read", "room_message_reaction", "room_message_movie", "room_message_mention", "room_message"',
    );
  }
}
