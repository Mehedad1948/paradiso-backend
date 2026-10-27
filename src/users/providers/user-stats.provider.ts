import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserFollow } from '../../community/user-follow.entity';
import { FavoriteMovie } from '../../favorites/favorite-movie.entity';
import { WatchlistItem } from '../../watchlist/watchlist-item.entity';

export const FAVORITE_POSTER_COUNT = 4;

export interface UserStats {
  followersCount: number;
  followingCount: number;
  favoritesCount: number;
  watchlistCount: number;
  favoritePosters: (string | null)[];
}

// Account totals shown with the signed-in user's profile. Each count is an
// index-only COUNT on a (userId, ...) or (followingId, ...) index.
@Injectable()
export class UserStatsProvider {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async forUser(userId: number): Promise<UserStats> {
    const count = async (
      entity: typeof UserFollow | typeof FavoriteMovie | typeof WatchlistItem,
      column: string,
    ) => {
      const row = await this.dataSource
        .createQueryBuilder(entity, 'row')
        .select('count(*)::int', 'count')
        .where(`row.${column} = :userId`, { userId })
        .getRawOne<{ count: number }>();
      return row?.count ?? 0;
    };
    const [
      followersCount,
      followingCount,
      favoritesCount,
      watchlistCount,
      posters,
    ] = await Promise.all([
      count(UserFollow, 'followingId'),
      count(UserFollow, 'followerId'),
      count(FavoriteMovie, 'userId'),
      count(WatchlistItem, 'userId'),
      this.dataSource
        .createQueryBuilder(FavoriteMovie, 'favorite')
        .innerJoin('favorite.movie', 'movie')
        .select('movie.poster_path', 'poster')
        .where('favorite.userId = :userId', { userId })
        .orderBy('favorite.position', 'ASC')
        .limit(FAVORITE_POSTER_COUNT)
        .getRawMany<{ poster: string | null }>(),
    ]);
    return {
      followersCount,
      followingCount,
      favoritesCount,
      watchlistCount,
      favoritePosters: posters.map(({ poster }) => poster || null),
    };
  }
}
