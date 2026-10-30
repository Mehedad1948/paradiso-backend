export const CURATION_KEYS = ['landing-grid', 'editors-picks'] as const;
export type CurationKey = (typeof CURATION_KEYS)[number];

export const LANDING_GRID = 'landing-grid' satisfies CurationKey;
export const EDITORS_PICKS = 'editors-picks' satisfies CurationKey;

// Valid grid slots are 0..LANDING_GRID_SLOTS - 1, row-major in the frontend grid.
export const LANDING_GRID_SLOTS = 27;
export const EDITORS_PICKS_MAX = 40;
export const MAX_OBJECT_POSITION = 40;
export const MAX_IMAGE_URL = 2048;

// Absolute https URL, or a site-relative path. "//host/x" is a URL in
// disguise and is not a path.
export const IMAGE_URL_PATTERN = /^(https:\/\/[^\s/]\S*|\/(?!\/)\S*)$/;

// Where an editors' pick cover may come from: a TMDb image, which is what
// GET /admin/curations/movies/:movieId/posters offers. Nothing else is served
// on the landing page under a pick.
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const TMDB_IMAGE_URL_PATTERN =
  /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d{2,4}|original)\/[\w-]+\.(?:jpg|jpeg|png|webp)$/;
// The size stored for a cover, and the one used for previews.
export const PICK_IMAGE_SIZE = 'w500';
export const PICK_THUMBNAIL_SIZE = 'w185';
export const MAX_POSTER_CHOICES = 30;
