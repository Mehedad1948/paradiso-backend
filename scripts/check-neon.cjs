const fs = require('node:fs');
const dotenv = require('dotenv');
const { Client } = require('pg');

for (const file of [
  '.env.local',
  `.env.${process.env.NODE_ENV || 'development'}`,
]) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}

async function main() {
  const connectionString = process.env.NEON_DB || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set NEON_DB or DATABASE_URL.');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' ORDER BY tablename
    `);
    // A pooled connection's pg_stat_ssl describes the pooler's upstream socket.
    console.log(
      'Database connection successful; TLS:',
      client.connection.stream.encrypted === true,
    );
    console.log(
      'Public tables:',
      rows.map((row) => row.tablename).join(', ') || '(none)',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Connection errors can contain credentials; report only the error code.
  console.error('Database check failed:', error.code || error.name);
  process.exitCode = 1;
});
