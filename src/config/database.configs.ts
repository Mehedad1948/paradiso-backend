import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || '55555',
  name: process.env.DATABASE_NAME || 'nestjs-blog',
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  autoLoadEntities: process.env.DATABASE_AUTOLOADENTITIES === 'true',
}));
