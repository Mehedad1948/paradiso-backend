export class CreateGenreDto {
  name: string;
  tmdbId?: number; // optional if syncing from TMDb
}
