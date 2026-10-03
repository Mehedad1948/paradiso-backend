const { ConfigModule } = require('@nestjs/config');
const { spawnSync } = require('node:child_process');

async function main() {
  await ConfigModule.forRoot({ envFilePath: '.env.development' });
  const host = process.env.DATABASE_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      'Database tests require a local PostgreSQL host. Set DATABASE_HOST explicitly.',
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      'endpoints.integration.spec',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        RUN_DATABASE_TESTS: 'true',
        DATABASE_SYNCHRONIZE: 'false',
      },
    },
  );
  process.exitCode = result.status ?? 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
