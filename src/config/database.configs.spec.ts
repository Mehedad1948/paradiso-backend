import databaseConfig from './database.configs';
import environmentValidation from './environment.validation';

describe('Neon database configuration', () => {
  const originalEnv = process.env;
  const url =
    'postgresql://user:password@db.example.test/neondb?sslmode=require';

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEON_DB;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses NEON_DB ahead of the CLI-generated URL and legacy settings', () => {
    process.env.NEON_DB = url;
    process.env.DATABASE_URL = 'postgresql://other:password@other.test/db';
    process.env.DATABASE_HOST = 'old.example.test';
    expect(databaseConfig().url).toBe(url);
  });

  it('supports DATABASE_URL pulled by the Neon CLI', () => {
    process.env.DATABASE_URL = url;
    expect(databaseConfig().url).toBe(url);
  });

  it('does not fall back to the previous database', () => {
    process.env.DATABASE_HOST = 'old.example.test';
    expect(databaseConfig().url).toBeUndefined();
  });

  it('disables automatic schema changes in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SYNCHRONIZE = 'true';
    expect(databaseConfig().synchronize).toBe(false);
  });

  const schema = environmentValidation.fork(
    Object.keys(
      environmentValidation.describe().keys as Record<string, unknown>,
    ),
    (field) => field.optional(),
  );

  it('requires a PostgreSQL URL and accepts either supported variable', () => {
    const settings = { R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' };
    expect(schema.validate(settings).error).toBeDefined();
    expect(
      schema.validate({ ...settings, NEON_DB: url }).error,
    ).toBeUndefined();
    expect(
      schema.validate({ ...settings, DATABASE_URL: url }).error,
    ).toBeUndefined();
    expect(
      schema.validate({ ...settings, NEON_DB: 'https://example.test' }).error,
    ).toBeDefined();
  });
});
