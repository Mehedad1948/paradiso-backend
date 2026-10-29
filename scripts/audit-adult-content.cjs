// Finds adult films and people linked to the library and blocks them.
// Requires `npm run build` and the ContentBlocks migration on the database.
//   node scripts/audit-adult-content.cjs           preview: writes audit/report.json
//   node scripts/audit-adult-content.cjs --apply   blocks them and deletes
//                                                  blocked library movies
// Options: --rounds=N (default 2), --cast=N (default 15).
// Reads AUDIT_DATABASE_URL (a direct, non-pooler URL; use a Neon branch
// first) and TMDB_API_KEY from .env.local or .env.development. TMDb answers
// are cached in audit/tmdb-cache.json, so re-runs after a rule change are
// fast and cost no TMDb requests.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { auditContent } = require('../dist/movies/content-audit');

// Reported by hand; blocked whatever the rules say.
const MANUAL_PEOPLE = [104461, 5959975, 1089700, 1624508, 1225990, 72838];
const MANUAL_LIBRARY_MOVIES = [
  'fa7dec7c-c087-4f60-b4f6-f8d885035261',
  '1c3bde3d-6650-4df6-b8df-8bbcb616bd0b',
  'e89a46a6-b0ff-4e39-a1d9-388853c17d3c',
  '82295847-a29b-4f8f-a1d3-d5ade9542717',
  '608fa598-9f1c-456f-a385-23e47f2943aa',
  'caf2f2ab-0cd8-44c8-af29-987e54a769a5',
  '9341e126-42eb-416f-9c1f-b9cb727ec871',
  '933f9f26-8ea5-49a5-b720-7a4712c49fa8',
  '14309cdb-bb56-4af3-aaac-cf52f3301fb3',
];
// Kept by hand despite the rules: legitimate films users added, and the
// person whose bio linked one of them.
const KEEP_MOVIES = [110, 54328]; // Three Colors: Red, Ocean Heaven
const KEEP_PEOPLE = [74022]; // Gao Yuanyuan
const OUT = path.join(__dirname, '../audit');
const DELAY_MS = 250;

const option = (name, fallback) => {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? Number(arg.split('=')[1]) : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Node's fetch ignores HTTPS_PROXY; curl honours it, so behind a proxy the
// requests go through curl. Both return { status, headers, json() }.
async function request(url) {
  if (!process.env.HTTPS_PROXY && !process.env.https_proxy)
    return fetch(url, { signal: AbortSignal.timeout(15000) });
  const { execFile } = require('node:child_process');
  const stdout = await new Promise((resolve, reject) =>
    execFile(
      'curl',
      ['-s', '--max-time', '15', '-w', '\n%{http_code}', url.toString()],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, out) => (error ? reject(error) : resolve(out)),
    ),
  );
  const split = stdout.lastIndexOf('\n');
  const body = stdout.slice(0, split);
  const status = Number(stdout.slice(split + 1));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => JSON.parse(body),
  };
}

function tmdbClient(apiKey) {
  const file = path.join(OUT, 'tmdb-cache.json');
  const cache = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  let requests = 0;
  let dirty = 0;
  const save = () => {
    fs.writeFileSync(file, JSON.stringify(cache));
    dirty = 0;
  };
  async function get(endpoint, params) {
    if (endpoint in cache) return cache[endpoint];
    const url = new URL('https://api.themoviedb.org/3/' + endpoint);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    for (let attempt = 0; ; attempt++) {
      await sleep(DELAY_MS);
      requests++;
      let res;
      try {
        res = await request(url);
      } catch (error) {
        // Timeouts and dropped connections: back off and try again.
        if (attempt >= 5) throw error;
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep(Number(res.headers.get('retry-after') || 2) * 1000);
        continue;
      }
      if (res.status === 404) return (cache[endpoint] = null);
      if (!res.ok) throw new Error(`TMDb ${endpoint}: HTTP ${res.status}`);
      cache[endpoint] = await res.json();
      if (++dirty >= 250) save();
      if (requests % 100 === 0) console.log(`  ${requests} TMDb requests`);
      return cache[endpoint];
    }
  }
  return {
    requests: () => requests,
    save,
    async movie(id) {
      const movie = await get('movie/' + id, {
        append_to_response: 'credits,keywords',
      });
      if (!movie) return null;
      return {
        ...movie,
        cast: (movie.credits?.cast ?? []).map((member) => ({
          id: member.id,
          name: member.name,
          character: member.character,
        })),
      };
    },
    async person(id) {
      const person = await get('person/' + id, {
        append_to_response: 'movie_credits',
      });
      if (!person) return null;
      return {
        id: person.id,
        name: person.name,
        adult: person.adult,
        biography: person.biography,
        credits: [
          ...(person.movie_credits?.cast ?? []),
          ...(person.movie_credits?.crew ?? []),
        ],
      };
    },
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  for (const file of ['.env.local', '.env.development'])
    if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
  const url = process.env.AUDIT_DATABASE_URL?.trim();
  if (!url) throw new Error('Set AUDIT_DATABASE_URL.');
  if (new URL(url).hostname.includes('-pooler'))
    throw new Error('AUDIT_DATABASE_URL must be a direct (non-pooler) URL.');
  if (!process.env.TMDB_API_KEY) throw new Error('Set TMDB_API_KEY.');
  fs.mkdirSync(OUT, { recursive: true });

  // Neon closes idle connections, so the crawl runs disconnected.
  const connect = async () => {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    client.on('error', (error) => console.error('Database:', error.message));
    await client.connect();
    return client;
  };
  console.log('Database:', new URL(url).hostname);
  const reader = await connect();
  const library = (
    await reader.query(
      'SELECT id, "dbId", title FROM movie WHERE "dbId" IS NOT NULL',
    )
  ).rows;
  await reader.end();
  let db;
  try {
    const byTmdbId = new Map(library.map((movie) => [movie.dbId, movie]));
    const manualMovies = library
      .filter((movie) => MANUAL_LIBRARY_MOVIES.includes(movie.id))
      .map((movie) => movie.dbId);
    console.log(`Library: ${library.length} catalogue movies`);

    const tmdb = tmdbClient(process.env.TMDB_API_KEY);
    let blocks;
    try {
      blocks = await auditContent(tmdb, {
        libraryTmdbIds: library.map((movie) => movie.dbId),
        manualMovies,
        manualPeople: MANUAL_PEOPLE,
        keepMovies: KEEP_MOVIES,
        keepPeople: KEEP_PEOPLE,
        rounds: option('rounds', 2),
        castLimit: option('cast', 15),
        log: console.log,
      });
    } finally {
      tmdb.save();
    }

    const libraryDeletes = blocks
      .filter((entry) => entry.kind === 'movie' && byTmdbId.has(entry.tmdbId))
      .map((entry) => ({ ...byTmdbId.get(entry.tmdbId), ...entry }));
    const report = {
      database: new URL(url).hostname,
      generatedAt: new Date().toISOString(),
      tmdbRequests: tmdb.requests(),
      counts: {
        libraryMoviesToDelete: libraryDeletes.length,
        blockedMovies: blocks.filter((entry) => entry.kind === 'movie').length,
        blockedPeople: blocks.filter((entry) => entry.kind === 'person')
          .length,
      },
      libraryMoviesToDelete: libraryDeletes,
      blockedPeople: blocks.filter((entry) => entry.kind === 'person'),
      blockedMovies: blocks.filter((entry) => entry.kind === 'movie'),
    };
    fs.writeFileSync(
      path.join(OUT, 'report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report.counts));
    console.log('Library movies to delete:');
    for (const movie of libraryDeletes)
      console.log(
        `  ${movie.id}  tmdb ${movie.tmdbId}  ${movie.title}  [${movie.source}: ${movie.reason}]`,
      );
    if (!apply) {
      console.log('Preview only; see audit/report.json. Use --apply to block.');
      return;
    }

    db = await connect();
    await db.query('BEGIN');
    try {
      // Everything a deleted movie takes with it, for the record.
      const ids = libraryDeletes.map((movie) => movie.id);
      const backup = {
        movies: (await db.query('SELECT * FROM movie WHERE id = ANY($1)', [ids]))
          .rows,
      };
      for (const table of [
        'rating',
        'community_post',
        'movie_comment',
        'watchlist_item',
        'favorite_movie',
      ])
        backup[table] = (
          await db.query(`SELECT * FROM "${table}" WHERE "movieId" = ANY($1)`, [
            ids,
          ])
        ).rows;
      backup.room_movies = (
        await db.query(
          'SELECT * FROM room_movies_movie WHERE "movieId" = ANY($1)',
          [ids],
        )
      ).rows;
      const backupFile = path.join(OUT, `backup-${Date.now()}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
      for (const entry of blocks)
        await db.query(
          `INSERT INTO content_block (kind, "tmdbId", source, label, reason)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (kind, "tmdbId") DO NOTHING`,
          [
            entry.kind,
            entry.tmdbId,
            entry.source,
            entry.label?.slice(0, 255),
            entry.reason,
          ],
        );
      const deleted = await db.query('DELETE FROM movie WHERE id = ANY($1)', [
        ids,
      ]);
      await db.query('COMMIT');
      console.log(
        `Blocked ${blocks.length} items, deleted ${deleted.rowCount} library movies. Backup: ${backupFile}`,
      );
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db?.end();
  }
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exitCode = 1;
});
