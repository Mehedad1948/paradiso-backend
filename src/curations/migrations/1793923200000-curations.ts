import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

// What the landing page showed before the grid was editable: [slot, TMDb id,
// title, image, object-position]. imageUrl values are frontend paths.
const GRID: [number, number, string, string, string][] = [
  [
    0,
    8967,
    'The Tree of Life',
    '/posters/grids/blue/tree-of-life.jpg',
    'center',
  ],
  [
    1,
    144,
    'Wings of Desire',
    '/posters/grids/blue/wings-of-desire.jpg',
    'center',
  ],
  [2, 567, 'Rear Window', '/posters/grids/purple/rear-window.jpg', 'center'],
  [3, 313369, 'La La Land', '/posters/grids/purple/lalaland.jpg', 'center'],
  [
    4,
    2013,
    'The Diving Bell and the Butterfly',
    '/posters/grids/green/diving-bell.jpg',
    'center 40%',
  ],
  [5, 54328, 'Ocean Heaven', '/posters/grids/blue/ocean-heaven.jpg', 'center'],
  [
    6,
    116745,
    'The Secret Life of Walter Mitty',
    '/posters/grids/blue/walter-mitty.jpg',
    'center',
  ],
  [7, 245891, 'John Wick', '/posters/grids/blue/jhon-weak.jpg', 'center 30%'],
  [8, 152601, 'Her', '/posters/grids/her.jpg', 'center 30%'],
  [9, 603, 'The Matrix', '/posters/grids/green/matrix.jpg', 'center 35%'],
  [10, 1398, 'Stalker', '/posters/grids/green/stalker.jpg', 'center'],
  [
    11,
    655,
    'Paris, Texas',
    '/posters/grids/blue/paris-texas.jpg',
    'center 35%',
  ],
  [
    12,
    37165,
    'The Truman Show',
    '/posters/grids/blue/trueman-show.jpg',
    'center 35%',
  ],
  [13, 429200, 'Good Time', '/posters/grids/red/good-times.jpg', 'center'],
  [
    14,
    110,
    'Three Colors: Red',
    '/posters/grids/red/color-red.jpg',
    'center 35%',
  ],
  [
    15,
    8967,
    'The Tree of Life',
    '/posters/grids/blue/tree-of-life.jpg',
    'center',
  ],
  [16, 77, 'Memento', '/posters/grids/red/meemnto.jpg', 'center 35%'],
  [
    17,
    582,
    'The Lives of Others',
    '/posters/grids/red/life-of-others.jpg',
    'center',
  ],
  [18, 426, 'Vertigo', '/posters/grids/red/vertigo.jpg', 'center'],
  [19, 194, 'Amélie', '/posters/grids/red/ameli.jpg', 'center'],
  [20, 632, 'Stalag 17', '/posters/grids/red/stalag-17.jpg', 'center'],
  [21, 693134, 'Dune: Part Two', '/posters/grids/red/dune.webp', 'center'],
  [
    22,
    10315,
    'Fantastic Mr. Fox',
    '/posters/grids/yellow/fantastic-fox.jpg',
    'center',
  ],
  [23, 24, 'Kill Bill', '/posters/grids/yellow/kill-bill.jpg', 'center'],
  [24, 103, 'Taxi Driver', '/posters/grids/yellow/taxi-driver.jpg', 'center'],
  [25, 389, '12 Angry Men', '/posters/grids/yellow/12-angry-man.jpg', 'center'],
  [
    26,
    10315,
    'Fantastic Mr. Fox',
    '/posters/grids/yellow/fantastic-fox.jpg',
    'center',
  ],
];

// The landing page's hand-curated lists: the poster grid and editors' picks.
export class Curations1793923200000 implements MigrationInterface {
  name = 'Curations1793923200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "curation" (
        "key" character varying(32) NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by" integer,
        CONSTRAINT "PK_curation" PRIMARY KEY ("key"),
        CONSTRAINT "CHK_curation_key" CHECK ("key" IN ('landing-grid', 'editors-picks')),
        CONSTRAINT "FK_curation_updated_by" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "curation_item" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "curation_key" character varying(32) NOT NULL,
        "movie_id" uuid NOT NULL,
        "slot" integer NOT NULL,
        "image_url" character varying(2048),
        "object_position" character varying(40),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_curation_item" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_curation_item_key_slot" UNIQUE ("curation_key", "slot"),
        CONSTRAINT "CHK_curation_item_slot" CHECK ("slot" >= 0),
        CONSTRAINT "CHK_curation_item_grid_only" CHECK ("curation_key" = 'landing-grid' OR ("image_url" IS NULL AND "object_position" IS NULL)),
        CONSTRAINT "FK_curation_item_curation" FOREIGN KEY ("curation_key") REFERENCES "curation"("key") ON DELETE CASCADE,
        CONSTRAINT "FK_curation_item_movie" FOREIGN KEY ("movie_id") REFERENCES "movie"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_curation_item_movie_id" ON "curation_item" ("movie_id")',
    );
    // A movie is a pick once; the grid may repeat movies.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_curation_item_editors_pick_movie" ON "curation_item" ("curation_key", "movie_id") WHERE "curation_key" = 'editors-picks'`,
    );
    await queryRunner.query(
      `INSERT INTO "curation" ("key") VALUES ('landing-grid'), ('editors-picks')`,
    );

    // One statement; films that are not in the library simply do not join.
    const cells = GRID.map(
      (_, i) =>
        `($${i * 4 + 1}::int, $${i * 4 + 2}::int, $${i * 4 + 3}::text, $${i * 4 + 4}::text)`,
    ).join(', ');
    const inserted = (await queryRunner.query(
      `INSERT INTO "curation_item" ("curation_key", "movie_id", "slot", "image_url", "object_position")
       SELECT 'landing-grid', m."id", v.slot, v.image_url, v.object_position
       FROM (VALUES ${cells}) AS v(slot, tmdb_id, image_url, object_position)
       JOIN "movie" m ON m."dbId" = v.tmdb_id
       RETURNING "slot"`,
      GRID.flatMap(([slot, tmdbId, , imageUrl, position]) => [
        slot,
        tmdbId,
        imageUrl,
        position,
      ]),
    )) as { slot: number }[] | undefined;
    // The migration script's preview mode runs no SQL and returns nothing.
    if (!inserted) return;
    const logger = new Logger('Curations');
    const seeded = new Set(inserted.map((row) => row.slot));
    for (const [slot, tmdbId, title] of GRID)
      if (!seeded.has(slot))
        logger.warn(
          `Grid slot ${slot} skipped: "${title}" (TMDb ${tmdbId}) is not in the library`,
        );
    logger.log(`Seeded ${seeded.size} of ${GRID.length} landing grid cells`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "curation_item"');
    await queryRunner.query('DROP TABLE "curation"');
  }
}
