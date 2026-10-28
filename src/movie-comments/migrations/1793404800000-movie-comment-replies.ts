import { MigrationInterface, QueryRunner } from 'typeorm';

export class MovieCommentReplies1793404800000 implements MigrationInterface {
  name = 'MovieCommentReplies1793404800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "movie_comment"
        ADD COLUMN "parentId" integer REFERENCES "movie_comment"("id") ON DELETE CASCADE;
      CREATE INDEX "IDX_movie_comment_parent_id" ON "movie_comment" ("parentId", "id");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "movie_comment" DROP COLUMN "parentId"',
    );
  }
}
