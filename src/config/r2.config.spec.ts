import appConfig from './app.config';
import environmentValidation from './environment.validation';

describe('R2 configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.R2_ENDPOINT;
    process.env.R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['default', 'eu', 'us', 'fedramp'])(
    'selects the %s jurisdiction endpoint',
    (jurisdiction) => {
      process.env.jurisdiction = jurisdiction;
      const suffix = jurisdiction === 'default' ? '' : `.${jurisdiction}`;
      expect(appConfig().r2Endpoint).toBe(
        `https://${process.env.R2_ACCOUNT_ID}${suffix}.r2.cloudflarestorage.com`,
      );
    },
  );

  it('uses an explicit endpoint when supplied', () => {
    process.env.R2_ENDPOINT =
      'https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com';
    expect(appConfig().r2Endpoint).toBe(process.env.R2_ENDPOINT);
  });

  const schema = environmentValidation.fork(
    Object.keys(
      environmentValidation.describe().keys as Record<string, unknown>,
    ).filter(
      (key) =>
        !key.startsWith('R2_') &&
        !key.startsWith('S3_') &&
        key !== 'jurisdiction',
    ),
    (field) => field.optional(),
  );
  const settings = {
    DATABASE_URL: 'postgresql://user:password@localhost/test',
    R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    R2_BUCKET_NAME: 'images',
    R2_PUBLIC_URL: 'https://images.example.test',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
  };

  it('requires an account ID or endpoint and the public URL', () => {
    expect(schema.validate(settings).error).toBeUndefined();
    expect(
      schema.validate({ ...settings, R2_ACCOUNT_ID: undefined }).error,
    ).toBeDefined();
    expect(
      schema.validate({ ...settings, R2_PUBLIC_URL: undefined }).error,
    ).toBeDefined();
    expect(
      schema.validate({
        ...settings,
        R2_PUBLIC_URL: 'https://images.example.test?token=x',
      }).error,
    ).toBeDefined();
    expect(
      schema.validate({ ...settings, jurisdiction: 'apac' }).error,
    ).toBeDefined();
  });

  it('allows an explicit endpoint without an account ID', () => {
    expect(
      schema.validate({
        ...settings,
        R2_ACCOUNT_ID: undefined,
        R2_ENDPOINT:
          'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
      }).error,
    ).toBeUndefined();
  });
});
