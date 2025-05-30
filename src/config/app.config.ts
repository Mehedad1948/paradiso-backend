import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'production',
  apiVersion: process.env.API_VERSION,
  awsBucketName: process.env.LIARA_BUCKET_NAME,
  awsAddress: process.env.LIARA_ENDPOINT,
  awsSecretKey: process.env.LIARA_SECRET_KEY,
  awsAccessKey: process.env.LIARA_ACCESS_KEY,
  awsRegion: process.env.LIARA_REGION,
  mailHost: process.env.MAIL_HOST,
  smtpUsername: process.env.SMTP_USERNAME,
  smtpPassword: process.env.SMTP_PASSWORD,
}));
