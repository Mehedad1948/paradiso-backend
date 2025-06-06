import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MovieDbService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('appConfig.tmdbApiKey')!;
    this.baseUrl = this.configService.get<string>('appConfig.baseUrl')!;
  }

  private buildUrl(endpoint: string, params: Record<string, any> = {}): string {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.append('api_key', this.apiKey);
    url.searchParams.append('language', 'en-US');

    for (const key in params) {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, String(params[key]));
      }
    }

    return url.toString();
  }

  async searchMovies(query: string, page = 1): Promise<any> {
    const url = this.buildUrl('search/movie', { query, page });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDb search failed: ${res.statusText}`);
    return res.json();
  }

  async getGenres(): Promise<any[]> {
    const url = this.buildUrl('genre/movie/list');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDb genres fetch failed: ${res.statusText}`);
    const data = await res.json();
    return data.genres;
  }

  async getMovieDetails(movieId: number): Promise<any> {
    const url = this.buildUrl(`movie/${movieId}`);
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`TMDb movie details failed: ${res.statusText}`);
    return res.json();
  }
}
