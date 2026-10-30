# Curated landing lists

The home page has two hand-curated movie lists. Admins edit each list as a
whole; everyone reads it. "Admin" is the **site-wide `admin` role** in the
access token, not a room admin. "Movie" is always a **library** movie: `id` is
our uuid, `dbId` the TMDb id.

| Key            | Landing section        | Shape                                   |
| -------------- | ---------------------- | --------------------------------------- |
| `landing-grid` | Stepped poster grid    | Fixed slots `0..26` (positions matter)  |
| `editors-picks`| Shelf carousel         | Unordered pool of up to 40, in admin order, each with an optional cover |

The backend does no caching, scheduling or randomness here. The frontend caches
both lists, invalidates them when the admin saves, and picks the day's subset of
the pool with its own date-seeded shuffle.

## Endpoints

Public, no token (no cache headers):

- `GET /curations/landing-grid` — `{ data: [{ slot, imageUrl, objectPosition, movie }], updatedAt }`,
  slot ascending, empty slots omitted. A cell shows `imageUrl`, or the movie's
  `poster_path` when `imageUrl` is `null`.
- `GET /curations/editors-picks` — `{ data: [{ movie, imageUrl }], updatedAt }`, the whole
  pool in admin order. A pick shows its `imageUrl` (a TMDb image URL), or the
  movie's `poster_path` when `imageUrl` is `null`.

The public reads leave out a movie that cannot be shown: no poster _and_ no
`imageUrl`, or blocked from the catalogue (`content_block`).
They never fail because of it; an empty list is a valid answer.

Admin (`401` without a token, `403` for non-admins):

| Endpoint                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `GET /admin/curations/landing-grid`  | The grid as stored, plus `updatedBy` (`{ id, username }` or `null`). Nothing is hidden, posterless movies included. |
| `PUT /admin/curations/landing-grid`  | Replace the whole grid. Body `{ items: [{ slot, movieId, imageUrl?, objectPosition? }] }` |
| `GET /admin/curations/editors-picks` | The pool as stored, plus `updatedBy`                            |
| `PUT /admin/curations/editors-picks` | Replace the whole pool. Body `{ items: [{ movieId, imageUrl? }] }`, array order = display order. The older `{ movieIds: [...] }` still works but resets every cover to the poster; send one of the two, not both (400) |
| `GET /admin/curations/movies/{movieId}/posters` | The TMDb posters a pick's cover can be chosen from (library movie id) |

A `PUT` replaces the list in one transaction (all of it or none), sets
`updatedAt` / `updatedBy`, and answers with the stored list, like the matching
`GET`. An empty array clears the list. There are no per-item routes.

## Validation

| Case                                                                 | Status |
| -------------------------------------------------------------------- | ------ |
| Slot outside `0..26`, repeated slot, repeated `movieId` in editors-picks | 400 |
| More than 27 grid cells, or more than 40 editors' picks              | 400    |
| `imageUrl` that is not an `https://` URL or a path starting with `/` (so `//host/x` is rejected) | 400 |
| `objectPosition` longer than 40 characters                           | 400    |
| Malformed uuid, unknown field, wrong type                            | 400    |
| A `movieId` not in the library (the message lists every missing id)  | 422    |
| An editors' pick with neither a movie `poster_path` nor an `imageUrl` (the message names it) | 422 |
| An editors' pick `imageUrl` that is not a `https://image.tmdb.org/t/p/<size>/<file>` URL | 400 |
| `items` together with `movieIds`, or an `objectPosition` on a pick | 400 |

Blank `imageUrl` / `objectPosition` are stored as `null`. Ids are compared
case-insensitively. Checks run in this order: shape (400), repeats (400),
missing movies (422), posterless picks (422).

## Data

`curation` (one row per key, created by the migration) and `curation_item`
(`curation_key`, `movie_id`, `slot`, `image_url`, `object_position`).
`UNIQUE (curation_key, slot)`; a partial unique index keeps a movie to one
editors' pick while the grid may repeat movies; `ON DELETE CASCADE` on
`movie_id` removes a deleted library movie from every list; image fields are
`object_position` is only allowed on `landing-grid`; `image_url` is allowed on both (a pick's must be a TMDb URL, enforced by the API). `updated_by` is set to `NULL` if that account is
deleted.

Concurrent saves of one list queue on a row lock, so the last one wins whole,
never a mixture.

## Choosing a pick's cover

`GET /admin/curations/movies/{movieId}/posters` (admin, `movieId` is the library
uuid) asks TMDb for the film's posters in English or with no text and returns
`{ data: [{ imageUrl, thumbnailUrl, width, height, language, voteAverage, isDefault }] }`,
best rated first, at most 30. `imageUrl` is a `w500` image ready to send as the
pick's `imageUrl`; `thumbnailUrl` (`w185`) is for the picker; `isDefault` marks
the movie's current poster (sending `null` is how to go back to it). A movie
that did not come from TMDb gets `{ data: [] }`; an unknown movie, 404; TMDb
down, 502/504. Only TMDb image URLs are accepted as covers, so the shelf never
loads an image from anywhere else.

## Migration and seed

`1793923200000-curations` creates both tables and both `curation` rows, and
seeds `landing-grid` with the previous hard-coded grid (27 cells, matched by TMDb
id). Films that are not in the library are skipped and logged as warnings;
`editors-picks` starts empty, so the frontend keeps its fallback until it has
picks. Apply it like the other migrations (`npm run build`, then
`node scripts/migrate-community.cjs --apply`). `1794009600000-curation-pick-images` drops the rule that kept `image_url` to the
grid (`CHK_curation_item_grid_only` now only keeps `object_position` there). It
must be applied **before** the code that saves a pick cover; until then saving
one fails with a 500. Without the first migration the
endpoints answer 500 ("run the curations migration"): the rows are not created
at startup.

## Library search for the admin picker

`GET /movies?search=` matches `title` and `original_title`, case-insensitively,
as a substring (`%` and `_` in the text are literal). Blank is ignored, at most
100 characters, and it combines with `page`, `limit`, `startDate` and `endDate`.
Newest first, as before.
