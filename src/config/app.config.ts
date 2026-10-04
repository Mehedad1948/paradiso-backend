import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'production',
  apiVersion: process.env.API_VERSION,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2Endpoint:
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}${
          process.env.jurisdiction && process.env.jurisdiction !== 'default'
            ? `.${process.env.jurisdiction}`
            : ''
        }.r2.cloudflarestorage.com`
      : undefined),
  r2SecretKey: process.env.S3_SECRET_ACCESS_KEY,
  r2AccessKey: process.env.S3_ACCESS_KEY_ID,
  r2PublicUrl: process.env.R2_PUBLIC_URL,
  brevoApiKey: process.env.BRAVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  tmdbApiKey: process.env.TMDB_API_KEY,
  baseUrl: process.env.TMDB_BASE_URL,
  productBaseUrl: process.env.PRODUCT_BASE_URL,
}));
