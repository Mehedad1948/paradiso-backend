import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  host: process.env.DATABASE_HOST || 'localhost',
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  name: process.env.DATABASE_NAME || 'nestjs-blog',
  synchronize:
    process.env.NODE_ENV !== 'production' &&
    process.env.DATABASE_SYNCHRONIZE === 'true',
  autoLoadEntities: true,
}));
