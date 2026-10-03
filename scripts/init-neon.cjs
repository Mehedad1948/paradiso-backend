require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { DataSource } = require('typeorm');

for (const file of [
  '.env.local',
  `.env.${process.env.NODE_ENV || 'development'}`,
]) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}

async function main() {
  const url = process.env.NEON_DB || process.env.DATABASE_URL;
  if (!url || !new URL(url).hostname.endsWith('.neon.tech')) {
    throw new Error('This initializer requires a Neon database URL.');
  }
  const db = new DataSource({
    type: 'postgres',
    url,
    entities: [path.join(__dirname, '../dist/**/*.entity.js')],
    synchronize: false,
    logging: false,
    connectTimeoutMS: 15000,
  });
  try {
    await db.initialize();
    if (db.entityMetadatas.length === 0) {
      throw new Error('No compiled entities found. Run npm run build first.');
    }
    const tables = await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (tables.length) {
      throw new Error(
        'Initialization requires an empty public schema. Existing tables were preserved.',
      );
    }
    const plan = await db.driver.createSchemaBuilder().log();
    if (
      plan.upQueries.some((query) =>
        /\b(DROP|TRUNCATE)\b|^\s*DELETE\b/i.test(query.query),
      )
    ) {
      throw new Error(
        'Refusing a schema plan containing destructive statements.',
      );
    }
    const index =
      'CREATE INDEX IF NOT EXISTS "IDX_user_email_lower" ON "user" (LOWER("email"))';
    const roles =
      'INSERT INTO "role" ("name") VALUES (\'user\'), (\'admin\') ON CONFLICT ("name") DO NOTHING';
    const sql = [
      'BEGIN;',
      ...plan.upQueries.map((query) => `${query.query};`),
      `${index};`,
      `${roles};`,
      'COMMIT;',
    ].join('\n');
    fs.writeFileSync(
      path.join(__dirname, '../database/neon-initial-schema.sql'),
      `${sql}\n`,
    );
    console.log(
      'Wrote database/neon-initial-schema.sql; tables:',
      db.entityMetadatas.length,
    );
    if (!process.argv.includes('--apply')) {
      console.log('Run with --apply to initialize this empty database.');
      return;
    }
    await db.query(sql);
    console.log('Initialized Neon schema and default user/admin roles.');
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}

main().catch((error) => {
  // PostgreSQL errors may include connection details; only expose safe local errors.
  console.error(
    'Neon initialization failed:',
    error.code || (error.constructor === Error ? error.message : error.name),
  );
  process.exitCode = 1;
});
