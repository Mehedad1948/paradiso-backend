import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesModule } from '../movies/movies.module';
import { PeopleModule } from '../people/people.module';
import { AdminFeaturedController } from './featured-admin.controller';
import { FeaturedAdminService } from './featured-admin.service';
import { FeaturedArtist } from './featured-artist.entity';
import { FeaturedArtistsController } from './featured-artists.controller';
import { FeaturedArtistsService } from './featured-artists.service';
import { FeaturedCandidate } from './featured-candidate.entity';
import { FEATURED_CONFIG, parseFeaturedConfig } from './featured-config';
import { FeaturedSelectionService } from './featured-selection.service';
import { FeaturedStore } from './featured-store';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeaturedArtist, FeaturedCandidate]),
    MoviesModule,
    PeopleModule,
  ],
  controllers: [FeaturedArtistsController, AdminFeaturedController],
  providers: [
    { provide: FEATURED_CONFIG, useFactory: () => parseFeaturedConfig() },
    FeaturedStore,
    FeaturedSelectionService,
    FeaturedArtistsService,
    FeaturedAdminService,
  ],
})
export class FeaturedArtistsModule {}
