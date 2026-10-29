# Curated landing lists

The home page has two hand-curated movie lists. Admins edit each list as a
whole; everyone reads it. "Admin" is the **site-wide `admin` role** in the
access token, not a room admin. "Movie" is always a **library** movie: `id` is
our uuid, `dbId` the TMDb id.

| Key            | Landing section        | Shape                                   |
| -------------- | ---------------------- | --------------------------------------- |
| `landing-grid` | Stepped poster grid    | Fixed slots `0..26` (positions matter)  |
| `editors-picks`| Shelf carousel         | Unordered pool of up to 40, in admin order |

The backend does no caching, scheduling or randomness here. The frontend caches
both lists, invalidates them when the admin saves, and picks the day's subset of
the pool with its own date-seeded shuffle.

## Endpoints

Public, no token (no cache headers):

- `GET /curations/landing-grid` — `{ data: [{ slot, imageUrl, objectPosition, movie }], updatedAt }`,
  slot ascending, empty slots omitted. A cell shows `imageUrl`, or the movie's
  `poster_path` when `imageUrl` is `null`.
- `GET /curations/editors-picks` — `{ data: [{ movie }], updatedAt }`, the whole
  pool in admin order.

The public reads leave out a movie that cannot be shown: no poster (grid: no
poster _and_ no `imageUrl`), or blocked from the catalogue (`content_block`).
They never fail because of it; an empty list is a valid answer.

Admin (`401` without a token, `403` for non-admins):

| Endpoint                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `GET /admin/curations/landing-grid`  | The grid as stored, plus `updatedBy` (`{ id, username }` or `null`). Nothing is hidden, posterless movies included. |
| `PUT /admin/curations/landing-grid`  | Replace the whole grid. Body `{ items: [{ slot, movieId, imageUrl?, objectPosition? }] }` |
| `GET /admin/curations/editors-picks` | The pool as stored, plus `updatedBy`                            |
| `PUT /admin/curations/editors-picks` | Replace the whole pool. Body `{ movieIds: [...] }`, array order = display order |

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
| An editors' pick whose movie has no `poster_path` (the message names it) | 422 |

Blank `imageUrl` / `objectPosition` are stored as `null`. Ids are compared
case-insensitively. Checks run in this order: shape (400), repeats (400),
missing movies (422), posterless picks (422).

## Data

`curation` (one row per key, created by the migration) and `curation_item`
(`curation_key`, `movie_id`, `slot`, `image_url`, `object_position`).
`UNIQUE (curation_key, slot)`; a partial unique index keeps a movie to one
editors' pick while the grid may repeat movies; `ON DELETE CASCADE` on
`movie_id` removes a deleted library movie from every list; image fields are
only allowed on `landing-grid`. `updated_by` is set to `NULL` if that account is
deleted.

Concurrent saves of one list queue on a row lock, so the last one wins whole,
never a mixture.

## Migration and seed

`1793923200000-curations` creates both tables and both `curation` rows, and
seeds `landing-grid` with the previous hard-coded grid (27 cells, matched by TMDb
id). Films that are not in the library are skipped and logged as warnings;
`editors-picks` starts empty, so the frontend keeps its fallback until it has
picks. Apply it like the other migrations (`npm run build`, then
`node scripts/migrate-community.cjs --apply`). Without the migration the
endpoints answer 500 ("run the curations migration"): the rows are not created
at startup.

## Library search for the admin picker

`GET /movies?search=` matches `title` and `original_title`, case-insensitively,
as a substring (`%` and `_` in the text are literal). Blank is ignored, at most
100 characters, and it combines with `page`, `limit`, `startDate` and `endDate`.
Newest first, as before.
