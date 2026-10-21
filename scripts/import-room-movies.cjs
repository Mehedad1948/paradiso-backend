// Imports a room's movie history and ratings from a seed JSON file.
//   node scripts/import-room-movies.cjs [seed.json]          preview (TMDb lookups only)
//   node scripts/import-room-movies.cjs [seed.json] --apply  write in one transaction
// Re-running is safe: movies already in the room are reused and ratings upserted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const apply = process.argv.includes('--apply');
const seedFile =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ||
  path.join(__dirname, '../database/seeds/room-1-movies.json');

for (const file of [
  '.env.local',
  `.env.${process.env.NODE_ENV || 'development'}`,
]) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}

// Node's fetch ignores HTTPS_PROXY; route through it when undici is available.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  try {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch {
    console.warn(
      'HTTPS_PROXY is set but undici is not installed; ignoring it.',
    );
  }
}

async function tmdb(endpoint, params = {}) {
  const base = (
    process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3'
  ).replace(/\/$/, '');
  const url = new URL(base + '/' + endpoint);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TMDb ${endpoint} failed: ${res.status}`);
    return res.json();
  }
}

const normalise = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

// A same-titled movie wins even when the sheet's year is off by up to three;
// otherwise trust TMDb's top hit for that year (alternate/English titles).
// No hit at all leaves it as a custom movie.
async function findOnTmdb(movie) {
  const year = (m) => Number((m.release_date || '').slice(0, 4));
  const sameTitle = (m) =>
    [m.title, m.original_title].some(
      (t) => normalise(t || '') === normalise(movie.title),
    );
  const withYear = (
    await tmdb('search/movie', { query: movie.title, year: movie.year })
  ).results;
  const anyYear = (await tmdb('search/movie', { query: movie.title })).results;
  return (
    withYear.find((m) => sameTitle(m) && year(m) === movie.year) ||
    anyYear.find((m) => sameTitle(m) && Math.abs(year(m) - movie.year) <= 1) ||
    anyYear.find((m) => sameTitle(m) && Math.abs(year(m) - movie.year) <= 3) ||
    withYear[0] ||
    null
  );
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  if (!process.env.TMDB_API_KEY) throw new Error('Set TMDB_API_KEY.');

  const genreNames = new Map(
    (await tmdb('genre/movie/list')).genres.map((g) => [g.id, g.name]),
  );
  const matches = await mapLimit(seed.movies, 8, (movie) =>
    findOnTmdb(movie).catch((error) => {
      console.warn(`Lookup failed for "${movie.title}": ${error.message}`);
      return null;
    }),
  );

  const unmatched = [];
  seed.movies.forEach((movie, i) => {
    const m = matches[i];
    if (!m) unmatched.push(`${movie.title} (${movie.year})`);
    else if (
      normalise(m.title) !== normalise(movie.title) ||
      !(m.release_date || '').startsWith(String(movie.year))
    )
      console.log(
        `~ ${movie.title} (${movie.year}) -> ${m.title} (${(m.release_date || '').slice(0, 4)}) [tmdb ${m.id}]`,
      );
  });
  console.log(
    `\n${seed.movies.length - unmatched.length}/${seed.movies.length} matched on TMDb; lines marked ~ differ in title or year, check them.`,
  );
  if (unmatched.length)
    console.log(
      'Imported as custom movies (no poster):\n  ' + unmatched.join('\n  '),
    );

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write.');
    return;
  }

  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.NEON_DB ||
    process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL_UNPOOLED or NEON_DB.');
  const db = new Client({ connectionString: url });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  try {
    const [column] = await q(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'rating' AND column_name = 'rate'`,
    );
    if (column?.data_type !== 'numeric')
      throw new Error(
        'rating.rate is not numeric yet; run "npm run community:migrate -- --apply" first.',
      );

    await db.query('BEGIN');
    const [room] = await q('SELECT id, "ownerId" FROM room WHERE id = $1', [
      seed.roomId,
    ]);
    if (!room) throw new Error(`Room ${seed.roomId} does not exist.`);
    await q('SELECT 1 FROM room WHERE id = $1 FOR UPDATE', [room.id]);

    const [role] = await q(`SELECT id FROM role WHERE name = 'user'`);
    const users = {};
    for (const [key, rater] of Object.entries(seed.raters)) {
      let [user] = rater.userId
        ? await q('SELECT id FROM "user" WHERE id = $1', [rater.userId])
        : await q('SELECT id FROM "user" WHERE LOWER(email) = LOWER($1)', [
            rater.email,
          ]);
      if (!user && rater.userId)
        throw new Error(`User ${rater.userId} (${key}) does not exist.`);
      if (!user) {
        // Placeholder account: unusable password until the email is
        // replaced with a real one and the person resets it.
        const password = await bcrypt.hash(
          crypto.randomBytes(32).toString('hex'),
          10,
        );
        [user] = await q(
          `INSERT INTO "user" (email, password, username, "isEmailVerified", "roleId")
           VALUES ($1, $2, $3, false, $4) RETURNING id`,
          [rater.email, password, rater.username, role?.id ?? null],
        );
        console.log(`Created placeholder user ${rater.username} (#${user.id})`);
      }
      users[key] = user.id;
      await q(
        `INSERT INTO room_users_user ("roomId", "userId") VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [room.id, user.id],
      );
    }

    const genreIds = new Map();
    for (const [tmdbId, name] of genreNames) {
      const [genre] = await q(
        `INSERT INTO genre ("tmdbId", name) VALUES ($1, $2)
         ON CONFLICT ("tmdbId") DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tmdbId, name],
      );
      genreIds.set(tmdbId, genre.id);
    }

    let createdMovies = 0;
    let ratingCount = 0;
    for (const [i, movie] of seed.movies.entries()) {
      const m = matches[i];
      const releaseDate = m?.release_date || String(movie.year);
      // Reuse the movie if this room (or the catalogue) already has it.
      let [row] = m
        ? await q('SELECT id FROM movie WHERE "dbId" = $1', [m.id])
        : await q(
            `SELECT movie.id FROM movie
             JOIN room_movies_movie rm ON rm."movieId" = movie.id AND rm."roomId" = $1
             WHERE movie."dbId" IS NULL AND LOWER(movie.title) = LOWER($2)
               AND LEFT(movie.release_date, 4) = $3`,
            [room.id, movie.title, String(movie.year)],
          );
      if (!row) {
        [row] = await q(
          `INSERT INTO movie ("dbId", title, original_title, overview, poster_path,
             vote_average, release_date, "imdbRate", "isWatchedTogether",
             "createdAt", "updatedAt", "addedById")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)
           RETURNING id`,
          [
            m?.id ?? null,
            m?.title ?? movie.title,
            m?.original_title ?? null,
            m?.overview || null,
            m?.poster_path ?? null,
            m?.vote_average ?? null,
            releaseDate,
            movie.imdbRate,
            movie.watchedTogether,
            new Date(movie.createdAt),
            room.ownerId,
          ],
        );
        createdMovies++;
        for (const tmdbGenreId of m?.genre_ids ?? []) {
          const genreId = genreIds.get(tmdbGenreId);
          if (genreId)
            await q(
              `INSERT INTO movie_genres_genre ("movieId", "genreId") VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [row.id, genreId],
            );
        }
      }
      await q(
        `INSERT INTO room_movies_movie ("roomId", "movieId") VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [room.id, row.id],
      );
      for (const [key, rate] of Object.entries(movie.ratings)) {
        await q(
          `INSERT INTO rating ("userId", "movieId", "roomId", rate)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("userId", "movieId", "roomId") DO UPDATE SET rate = EXCLUDED.rate`,
          [users[key], row.id, room.id, rate],
        );
        ratingCount++;
      }
    }
    await db.query('COMMIT');
    console.log(
      `\nRoom ${room.id}: ${seed.movies.length} movies linked (${createdMovies} new), ${ratingCount} ratings written.`,
    );
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
