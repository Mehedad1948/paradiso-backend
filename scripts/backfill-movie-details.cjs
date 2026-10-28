// Refreshes stored TMDb details (backdrop gallery included) for catalogue
// movies whose rows are outdated, through the same code path as
// GET /movies/:id/details. Requires `npm run build` and the
// MovieDetailsVersion migration.
//   node scripts/backfill-movie-details.cjs          preview: list outdated movies
//   node scripts/backfill-movie-details.cjs --apply  refresh them, ~4 per second
// Re-running is safe: refreshed movies are no longer outdated, so a second
// run only retries movies TMDb failed on.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { DataSource } = require('typeorm');
const { Movie } = require('../dist/movies/movie.entity');
const { MovieDbService } = require('../dist/movies/providers/MovieDb.serviec');
const {
  MovieDetailsProvider,
} = require('../dist/movies/providers/movie-details.provider');

async function main() {
  const apply = process.argv.includes('--apply');
  for (const file of [
    '.env.local',
    `.env.${process.env.NODE_ENV || 'development'}`,
  ]) {
    if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
  }
  const url = process.env.NEON_DB || process.env.DATABASE_URL;
  if (!url) throw new Error('Set NEON_DB or DATABASE_URL.');
  if (apply && !process.env.TMDB_API_KEY) throw new Error('Set TMDB_API_KEY.');
  const db = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    connectTimeoutMS: 15000,
    entities: [path.join(__dirname, '../dist/**/*.entity.js')],
  });
  const config = {
    get: (key) =>
      ({
        'appConfig.tmdbApiKey': process.env.TMDB_API_KEY,
        'appConfig.baseUrl': process.env.TMDB_BASE_URL,
      })[key],
  };
  try {
    await db.initialize();
    const provider = new MovieDetailsProvider(
      db.getRepository(Movie),
      new MovieDbService(config),
    );
    if (!apply) {
      const outdated = await provider.findOutdated();
      for (const movie of outdated)
        console.log(`${movie.id}  tmdb ${movie.dbId}  ${movie.title}`);
      console.log(
        `${outdated.length} outdated movie(s). Preview only; use --apply to refresh them.`,
      );
      return;
    }
    const summary = await provider.refreshOutdated(undefined, console.log);
    const list = (movies) =>
      movies.map((m) => `  ${m.id}  tmdb ${m.dbId}  ${m.title}`).join('\n');
    console.log(
      [
        `Outdated: ${summary.outdated}`,
        `Refreshed: ${summary.refreshed}`,
        `Still empty on TMDb: ${summary.empty.length}`,
        list(summary.empty),
        `Unknown to TMDb: ${summary.missing.length}`,
        list(summary.missing),
        `Failed (re-run to retry): ${summary.failed.length}`,
        list(summary.failed),
      ]
        .filter(Boolean)
        .join('\n'),
    );
    if (summary.failed.length) process.exitCode = 1;
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exitCode = 1;
});
