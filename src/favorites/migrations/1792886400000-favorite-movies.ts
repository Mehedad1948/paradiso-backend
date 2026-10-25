import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-ordered favorite movies shown on a user's profile.
export class FavoriteMovies1792886400000 implements MigrationInterface {
  name = 'FavoriteMovies1792886400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "favorite_movie" (
        "userId" integer NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "movieId" uuid NOT NULL REFERENCES "movie"("id") ON DELETE CASCADE,
        "position" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "movieId")
      );
      CREATE INDEX "IDX_favorite_movie_user_position" ON "favorite_movie" ("userId", "position");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "favorite_movie"');
  }
}
