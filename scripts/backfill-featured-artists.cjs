// Fills the featured artist for past days that have none, with the same draw
// as the daily job, so the homepage history strip is not empty. Days that
// already have a pick are left alone; re-running is safe.
// Requires `npm run build`. Writes to the database the app config points at
// (NEON_DB from .env.local / .env.development).
//   node scripts/backfill-featured-artists.cjs            the 10 days before today
//   node scripts/backfill-featured-artists.cjs --days=20
require('reflect-metadata');
const { execFile } = require('node:child_process');
const { NestFactory } = require('@nestjs/core');

// Node's fetch ignores HTTPS_PROXY; behind a proxy, TMDb requests go
// through curl, which honours it.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  globalThis.fetch = (input) =>
    new Promise((resolve, reject) =>
      execFile(
        'curl',
        ['-s', '--max-time', '15', '-w', '\n%{http_code}', String(input)],
        { maxBuffer: 64 * 1024 * 1024 },
        (error, out) => {
          if (error) return reject(error);
          const split = out.lastIndexOf('\n');
          resolve(
            new Response(out.slice(0, split), {
              status: Number(out.slice(split + 1)),
              headers: { 'content-type': 'application/json' },
            }),
          );
        },
      ),
    );
}

async function main() {
  process.env.NODE_ENV ??= 'development';
  const arg = process.argv.find((value) => value.startsWith('--days='));
  const days = arg ? Number(arg.split('=')[1]) : 10;
  if (!Number.isInteger(days) || days < 1 || days > 60)
    throw new Error('--days must be between 1 and 60');

  const { AppModule } = require('../dist/app.module');
  const {
    FeaturedSelectionService,
  } = require('../dist/featured-artists/featured-selection.service');
  const { addDays, utcDate } = require('../dist/featured-artists/utc-date');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const selection = app.get(FeaturedSelectionService);
    const today = utcDate();
    // Nearest day first, so each draw sees the picks closest to it.
    for (let offset = 1; offset <= days; offset++) {
      const date = addDays(today, -offset);
      const row = await selection.selectFor(date);
      console.log(`${date}  ${row.name}  #${row.tmdbPersonId}  (${row.source})`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exitCode = 1;
});
