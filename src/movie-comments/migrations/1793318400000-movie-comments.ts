import { MigrationInterface, QueryRunner } from 'typeorm';

export class MovieComments1793318400000 implements MigrationInterface {
  name = 'MovieComments1793318400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "movie_comment" (
        "id" SERIAL PRIMARY KEY,
        "movieId" uuid NOT NULL REFERENCES "movie"("id") ON DELETE CASCADE,
        "authorId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "text" varchar(2000) NOT NULL,
        "spoiler" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_movie_comment_movie_id" ON "movie_comment" ("movieId", "id");
      CREATE INDEX "IDX_movie_comment_author_created" ON "movie_comment" ("authorId", "createdAt");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "movie_comment"');
  }
}
