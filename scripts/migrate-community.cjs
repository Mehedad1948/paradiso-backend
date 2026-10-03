require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { DataSource } = require('typeorm');
const {
  Community1790985600000,
} = require('../dist/community/migrations/1790985600000-community');

async function main() {
  // Preview SQL without opening a connection or reading credentials.
  if (!process.argv.includes('--apply')) {
    await new Community1790985600000().up({
      query: async (sql) => console.log(sql.trim()),
    });
    console.log(
      'Preview only. Use --apply with a direct database URL after testing on an isolated branch.',
    );
    return;
  }
  for (const file of [
    '.env.local',
    `.env.${process.env.NODE_ENV || 'development'}`,
  ]) {
    if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
  }
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.NEON_DB ||
    process.env.DATABASE_URL;
  if (!url)
    throw new Error('Set DATABASE_URL_UNPOOLED or NEON_DB/DATABASE_URL.');
  if (new URL(url).hostname.includes('-pooler'))
    throw new Error('Schema migrations require a direct database URL.');
  const db = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    connectTimeoutMS: 15000,
    migrations: [Community1790985600000],
    migrationsTableName: 'community_migrations',
  });
  try {
    await db.initialize();
    await db.runMigrations({ transaction: 'all' });
    console.log('Community migration applied successfully.');
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error(
    'Community migration failed:',
    error.code || (error.constructor === Error ? error.message : error.name),
  );
  process.exitCode = 1;
});
