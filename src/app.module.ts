import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { MoviesModule } from './movies/movies.module';
import { RatingsModule } from './ratings/ratings.module';
import { RolesModule } from './roles/roles.module';
import appConfig from './config/app.config';
import databaseConfigs from './config/database.configs';
import environmentValidation from './config/environment.validation';

const ENV = process.env.NODE_ENV || 'development';
@Module({
  imports: [
    // ConfigModule.forFeature(jwtConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${ENV}`],
      load: [appConfig, databaseConfigs],
      validationSchema: environmentValidation,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        console.log('✨✨✨', configService.get('database.autoLoadEntities'));

        return {
          port: +configService.get('database.port'),
          username: configService.get('database.username'),
          password: configService.get('database.password'),
          database: configService.get('database.name'),
          host: configService.get('database.host'),
          // entities: [__dirname + '/**/*.entity{.ts,.js}'],
          autoLoadEntities: configService.get('database.autoLoadEntities'),
          synchronize: configService.get('database.synchronize'),
          type: 'postgres',
        };
      },
    }),
    UsersModule,
    MoviesModule,
    RatingsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
