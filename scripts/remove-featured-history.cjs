// Deletes featured_artist rows (past or scheduled) for the people named below.
// The admin API refuses past days (409), so this goes straight to the database
// the app uses (NEON_DB from .env.local / .env.development). Rows for people
// not listed are never touched. The homepage strip just skips the removed days;
// run `node scripts/backfill-featured-artists.cjs` afterwards to refill past
// days with a fresh automatic draw if you want no gaps.
//   node scripts/remove-featured-history.cjs            preview, deletes nothing
//   node scripts/remove-featured-history.cjs --apply
const fs = require('node:fs');
const dotenv = require('dotenv');
const { Client } = require('pg');

for (const file of [
  '.env.local',
  `.env.${process.env.NODE_ENV || 'development'}`,
]) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}

// Matched on the stored name, case- and accent-insensitively, exact words.
const NAMES = [
  'Inde Navarrette',
  'Robert Burks',
  'Jessica Henwick',
  'Robert Richardson',
  'Sadie Sink',
  'Patton Oswalt',
];

async function main() {
  const connectionString = process.env.NEON_DB || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set NEON_DB or DATABASE_URL.');
  const apply = process.argv.includes('--apply');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, to_char(feature_date, 'YYYY-MM-DD') AS date, tmdb_person_id,
              name, source
         FROM featured_artist
        WHERE lower(name) = ANY($1)
        ORDER BY feature_date`,
      [NAMES.map((name) => name.toLowerCase())],
    );
    console.log(apply ? 'APPLYING' : 'PREVIEW (add --apply to delete)');
    for (const row of rows)
      console.log(
        `${row.date}  ${row.name}  #${row.tmdb_person_id}  (${row.source})`,
      );
    const found = new Set(rows.map((row) => row.name.toLowerCase()));
    for (const name of NAMES)
      if (!found.has(name.toLowerCase())) console.log(`no row for: ${name}`);
    if (apply && rows.length) {
      const result = await client.query(
        'DELETE FROM featured_artist WHERE id = ANY($1)',
        [rows.map((row) => row.id)],
      );
      console.log(`Deleted ${result.rowCount} row(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Connection errors can contain credentials; report only the error code.
  console.error('Failed:', error.code || error.name);
  process.exitCode = 1;
});
