// Boosts a hand-picked list of filmmakers to the maximum (10) and schedules
// them on the next free days, through the same admin service the endpoints
// use (so photo/biography checks and limits apply). Days that already have a
// pick are skipped, never overwritten; re-running is safe.
// Requires `npm run build`. Writes to the database the app config points at
// (NEON_DB from .env.local / .env.development).
//   node scripts/seed-featured-schedule.cjs            preview, writes nothing
//   node scripts/seed-featured-schedule.cjs --apply
//   options: --admin-id=<user id>  (default: the first site admin)
//            --start=YYYY-MM-DD    (default: tomorrow, UTC)
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

const BOOST = 10;
const NOTE = 'Editorial favourite: scheduled by hand.';
// TMDb person ids, in schedule order.
const PEOPLE = [
  [138, 'Quentin Tarantino'],
  [1032, 'Martin Scorsese'],
  [30715, 'Terrence Malick'],
  [5655, 'Wes Anderson'],
  [1126, 'Krzysztof Kieślowski'],
  [16767, 'Aki Kaurismäki'],
  [119294, 'Abbas Kiarostami'],
  [1098592, 'Bahram Beyzai'],
  [137427, 'Denis Villeneuve'],
];

const option = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  process.env.NODE_ENV ??= 'development';
  const apply = process.argv.includes('--apply');

  const { AppModule } = require('../dist/app.module');
  const {
    FeaturedAdminService,
  } = require('../dist/featured-artists/featured-admin.service');
  const { FeaturedStore } = require('../dist/featured-artists/featured-store');
  const {
    addDays,
    isUtcDate,
    utcDate,
  } = require('../dist/featured-artists/utc-date');
  const { DataSource } = require('typeorm');

  const start = option('start') ?? addDays(utcDate(), 1);
  if (!isUtcDate(start) || start < utcDate())
    throw new Error('--start must be a date as YYYY-MM-DD, today or later');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const admin = app.get(FeaturedAdminService);
    const store = app.get(FeaturedStore);

    let adminId = Number(option('admin-id'));
    if (!adminId) {
      const user = await app
        .get(DataSource)
        .getRepository('User')
        .findOne({ where: { role: { name: 'admin' } } });
      if (!user) throw new Error('No admin user found; pass --admin-id=<id>');
      adminId = user.id;
    }

    console.log(apply ? 'APPLYING' : 'PREVIEW (add --apply to write)');
    let date = start;
    for (const [id, label] of PEOPLE) {
      while (await store.findByDate(date)) {
        console.log(`${date}  taken, skipped`);
        date = addDays(date, 1);
      }
      console.log(`${date}  ${label}  #${id}  boost ${BOOST}`);
      if (apply) {
        await admin.upsertCandidate(id, { boost: BOOST, note: NOTE }, adminId);
        await admin.setDay(date, { tmdbPersonId: id }, adminId);
      }
      date = addDays(date, 1);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
});
