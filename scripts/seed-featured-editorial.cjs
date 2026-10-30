// Editorial rows for the automatic draw: a moderate boost for well-known and
// underrated filmmakers and actors, and a block for people who should never be
// picked. Nothing is scheduled; the daily draw does the picking. Goes through
// the admin service the endpoints use, so its checks apply. Re-running is safe.
// Requires `npm run build`. Writes to the database the app config points at
// (NEON_DB from .env.local / .env.development).
//   node scripts/seed-featured-editorial.cjs            preview, writes nothing
//   node scripts/seed-featured-editorial.cjs --apply
//   options: --admin-id=<user id>  (default: the first site admin)
//            --curl                send TMDb requests through curl
require('reflect-metadata');
const { execFile } = require('node:child_process');
const { NestFactory } = require('@nestjs/core');

// Node's fetch ignores HTTPS_PROXY; behind a proxy, TMDb requests go
// through curl, which honours it.
if (
  process.argv.includes('--curl') ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy
) {
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

const BOOST = 3;
const ATTEMPTS = 3;
const BOOST_NOTE = 'Editorial favourite: boosted in the automatic draw.';
const BLOCK_NOTE = 'Never auto-picked.';
// [TMDb person id, name]
const BOOSTED = [
  // Directors
  [6817, 'Agnès Varda'],
  [608, 'Hayao Miyazaki'],
  [10099, 'Park Chan-wook'],
  [21684, 'Bong Joon Ho'],
  [4762, 'Paul Thomas Anderson'],
  [45400, 'Greta Gerwig'],
  [68813, 'Céline Sciamma'],
  [229931, 'Asghar Farhadi'],
  [120229, 'Jafar Panahi'],
  [12453, 'Wong Kar-wai'],
  [8452, 'Andrei Tarkovsky'],
  [6648, 'Ingmar Bergman'],
  [122423, 'Yorgos Lanthimos'],
  [9888, 'Claire Denis'],
  [69759, 'Apichatpong Weerasethakul'],
  [85637, 'Béla Tarr'],
  [83287, 'Lynne Ramsay'],
  [11090, 'Edgar Wright'],
  [4429, 'Jim Jarmusch'],
  [5602, 'David Lynch'],
  [25645, 'Hirokazu Kore-eda'],
  [56383, 'Kelly Reichardt'],
  // Actors
  [3063, 'Tilda Swinton'],
  [112, 'Cate Blanchett'],
  [11856, 'Daniel Day-Lewis'],
  [17882, 'Isabelle Huppert'],
  [72466, 'Colin Farrell'],
  [7152, 'Sandra Hüller'],
  [17142, 'Paul Dano'],
  [3910, 'Frances McDormand'],
  [5293, 'Willem Dafoe'],
  [1337, 'Tony Leung Chiu-wai'],
  [20738, 'Song Kang-ho'],
  [1620, 'Michelle Yeoh'],
  [5469, 'Ralph Fiennes'],
  [2039, 'Brendan Gleeson'],
  [1639, 'Emily Watson'],
  [213371, 'Taraneh Alidoosti'],
];
const BLOCKED = [
  [19274, 'Seth Rogen'],
  [31, 'Tom Hanks'],
];

const option = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];

async function withRetry(label, task) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await task();
      return true;
    } catch (error) {
      console.log(`  ${label}: attempt ${attempt} failed: ${error.message}`);
    }
  }
  return false;
}

async function main() {
  process.env.NODE_ENV ??= 'development';
  const apply = process.argv.includes('--apply');

  const { AppModule } = require('../dist/app.module');
  const {
    FeaturedAdminService,
  } = require('../dist/featured-artists/featured-admin.service');
  const { DataSource } = require('typeorm');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const admin = app.get(FeaturedAdminService);

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
    const failed = [];
    const rows = [
      ...BOOSTED.map(([id, label]) => ({
        id,
        label,
        what: `boost ${BOOST}`,
        dto: { boost: BOOST, note: BOOST_NOTE },
      })),
      ...BLOCKED.map(([id, label]) => ({
        id,
        label,
        what: 'blocked',
        dto: { blocked: true, note: BLOCK_NOTE },
      })),
    ];
    for (const { id, label, what, dto } of rows) {
      console.log(`${label}  #${id}  ${what}`);
      if (!apply) continue;
      const done = await withRetry(label, () =>
        admin.upsertCandidate(id, dto, adminId),
      );
      if (!done) failed.push(label);
    }
    if (failed.length) {
      console.log(`Not saved: ${failed.join(', ')}. Run again to retry.`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
});
