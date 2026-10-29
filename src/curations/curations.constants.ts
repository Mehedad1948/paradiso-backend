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
