require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { DataSource } = require('typeorm');
const {
  Community1790985600000,
} = require('../dist/community/migrations/1790985600000-community');
const {
  RoomThemeColor1791676800000,
} = require('../dist/rooms/migrations/1791676800000-room-theme-color');
const {
  CustomMovies1792281600000,
} = require('../dist/movies/migrations/1792281600000-custom-movies');
const {
  RoomChat1792368000000,
} = require('../dist/room-chat/migrations/1792368000000-room-chat');
const {
  DecimalRatings1792454400000,
} = require('../dist/ratings/migrations/1792454400000-decimal-ratings');
const {
  PostReactionsReposts1792540800000,
} = require('../dist/community/migrations/1792540800000-post-reactions-reposts');
const {
  OnboardingGenres1792627200000,
} = require('../dist/users/migrations/1792627200000-onboarding-genres');
const {
  RoomBans1792713600000,
} = require('../dist/rooms/migrations/1792713600000-room-bans');
const {
  Watchlist1792800000000,
} = require('../dist/watchlist/migrations/1792800000000-watchlist');

const {
  FavoriteMovies1792886400000,
} = require('../dist/favorites/migrations/1792886400000-favorite-movies');
const {
  Notifications1792972800000,
} = require('../dist/notifications/migrations/1792972800000-notifications');
const {
  RoomUserInvitations1793059200000,
} = require('../dist/room-invitations/migrations/1793059200000-room-user-invitations');
const {
  FavoriteNotes1793145600000,
} = require('../dist/favorites/migrations/1793145600000-favorite-notes');
const {
  MovieDetails1793232000000,
} = require('../dist/movies/migrations/1793232000000-movie-details');

const {
  MovieComments1793318400000,
} = require('../dist/movie-comments/migrations/1793318400000-movie-comments');
const {
  MovieCommentReplies1793404800000,
} = require('../dist/movie-comments/migrations/1793404800000-movie-comment-replies');
const {
  MovieBackdrops1793491200000,
} = require('../dist/movies/migrations/1793491200000-movie-backdrops');
const {
  MovieDetailsVersion1793577600000,
} = require('../dist/movies/migrations/1793577600000-movie-details-version');
const {
  MovieCreditIds1793664000000,
} = require('../dist/movies/migrations/1793664000000-movie-credit-ids');
const {
  ContentBlocks1793750400000,
} = require('../dist/movies/migrations/1793750400000-content-blocks');

const migrations = [
  Community1790985600000,
  RoomThemeColor1791676800000,
  CustomMovies1792281600000,
  RoomChat1792368000000,
  DecimalRatings1792454400000,
  PostReactionsReposts1792540800000,
  OnboardingGenres1792627200000,
  RoomBans1792713600000,
  Watchlist1792800000000,
  FavoriteMovies1792886400000,
  Notifications1792972800000,
  RoomUserInvitations1793059200000,
  FavoriteNotes1793145600000,
  MovieDetails1793232000000,
  MovieComments1793318400000,
  MovieCommentReplies1793404800000,
  MovieBackdrops1793491200000,
  MovieDetailsVersion1793577600000,
  MovieCreditIds1793664000000,
  ContentBlocks1793750400000,
];

async function main() {
  // Preview SQL without opening a connection or reading credentials.
  if (!process.argv.includes('--apply')) {
    for (const Migration of migrations) {
      await new Migration().up({
        query: async (sql) => console.log(sql.trim()),
      });
    }
    console.log(
      'Preview only. Use --apply with a direct database URL after testing on an isolated branch.',
    );
    return;
  }
  for (const file of [
    '.env.local',
    `.env.${process.env.NODE_ENV || 'development'}`,
  ]) {
    if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
  }
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.NEON_DB ||
    process.env.DATABASE_URL;
  if (!url)
    throw new Error('Set DATABASE_URL_UNPOOLED or NEON_DB/DATABASE_URL.');
  if (new URL(url).hostname.includes('-pooler'))
    throw new Error('Schema migrations require a direct database URL.');
  const db = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    connectTimeoutMS: 15000,
    migrations,
    migrationsTableName: 'community_migrations',
  });
  try {
    await db.initialize();
    await db.runMigrations({ transaction: 'all' });
    console.log('Migrations applied successfully.');
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error(
    'Migration failed:',
    error.code || (error.constructor === Error ? error.message : error.name),
  );
  process.exitCode = 1;
});
