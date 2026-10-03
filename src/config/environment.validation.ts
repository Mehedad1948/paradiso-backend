import * as Joi from 'joi';

export default Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development')
    .required(),
  PORT: Joi.number().default(3000),
  R2_BUCKET_NAME: Joi.string().required(),
  R2_ACCOUNT_ID: Joi.string().hex().length(32),
  R2_ENDPOINT: Joi.string()
    .uri({ scheme: ['https'] })
    .pattern(
      /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\/?$/,
    )
    .when('R2_ACCOUNT_ID', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  R2_PUBLIC_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .pattern(/^https:\/\/[^?#]+$/)
    .required(),
  S3_ACCESS_KEY_ID: Joi.string().required(),
  S3_SECRET_ACCESS_KEY: Joi.string().required(),
  jurisdiction: Joi.string()
    .valid('default', 'eu', 'us', 'fedramp')
    .empty('')
    .default('default'),
  DATABASE_HOST: Joi.string().default('localhost').required(),
  DATABASE_PORT: Joi.number().default(5432).required(),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_SYNCHRONIZE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.valid(false).default(false),
    otherwise: Joi.boolean().default(false),
  }),
  DATABASE_AUTOLOADENTITIES: Joi.boolean().default(true).required(),
  PROFILE_API_KEY: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_TOKEN_AUDIENCE: Joi.string().required(),
  JWT_TOKEN_ISSUER: Joi.string().required(),
  JWT_ACCESS_TOKEN_TTL: Joi.number().required(),
  JWT_REFRESH_TOKEN_TTL: Joi.number().required(),
  JWT_INVITATION_TOKEN_TTL: Joi.number().required(),
  API_VERSION: Joi.string().required(),
  PRODUCT_BASE_URL: Joi.string().required(),
  TMDB_API_KEY: Joi.string().required(),
  TMDB_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://api.themoviedb.org/3'),
});
