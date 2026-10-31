# Redis cache (TMDb responses)

A shared cache in front of TMDb, backed by Upstash Redis. It makes repeat
lookups fast and spares TMDb's rate limit. **Redis is only an accelerator:**
with no `REDIS_URL`, in tests (`NODE_ENV=test`), or while Redis is down, every
call is a miss and the app loads from TMDb as before. Nothing lives only in
Redis, and there is no migration.

## Setup

- `REDIS_URL`: the `rediss://` **TCP** URL (not the REST URL). Optional.
  Set it in `.env.development` and in Render's environment.
- Keep Redis in the same region as the Render service. A cross-ocean Redis can
  cost as much as the TMDb call it replaces. Commands time out after 500 ms
  and count as a miss, so a far-away Redis silently stops helping.
- Dev and production may share one Redis database; the data is public TMDb
  data. Keys are prefixed `paradiso:v1:`; bump `v1` in `cache.service.ts` if
  the shape of a stored value changes.

## What is cached (`TMDB_CACHE_TTL` in `MovieDb.serviec.ts`)

| Call                               | Key                                   | TTL     |
| ---------------------------------- | ------------------------------------- | ------- |
| genres                             | `tmdb:genre/movie/list?...`           | 30 days |
| movie details (`/movies/tmdb/:id`) | `tmdb:movie/<id>?...`                 | 7 days  |
| posters                            | `tmdb:movie/<id>/images?...`          | 30 days |
| person, person profile             | `tmdb:person/<id>?...` (per language) | 3 days  |
| popular people                     | `tmdb:person/popular?...`             | 24 h    |
| movie search (filtered result)     | `tmdb:search-movies:<page>:<query>`   | 6 h     |
| people search                      | `tmdb:search/person?...`              | 6 h     |
| erotic-keyword verdict per movie   | `tmdb:erotic:<id>`                    | 7 days  |

Not cached: `getMovieDetailsWithExtras` (used on import; very large) and
errors, including 404s. Content blocks and the adult filter run on read, after
the cache, so blocking a title takes effect at once. Concurrent requests for
one key share a single TMDb call.

Movie search caches the **filtered** page, so a hit skips the search and the
up to 20 keyword lookups that hide erotic titles.

## Measuring the effect

```powershell
node scripts/benchmark-tmdb-cache.cjs <label> https://paradiso-backend-g4zx.onrender.com 12
```

Sends anonymous GETs to the TMDb-backed routes, sequentially, and saves
`docs/perf/<label>.json`. Run it **twice after deploying**: the first run
fills the cache (`after-redis-cold`), the second shows hits
(`after-redis-warm`). TMDb is not reachable from every network (it timed out
from the development PC), so measure against the deployed service.

### Baseline, before Redis

`docs/perf/baseline-before-redis.json`, 12 requests per route from the
developer PC, failed requests (dropped connections on the client side)
excluded. Milliseconds.

| Route                              | median | p95  | max  |
| ---------------------------------- | ------ | ---- | ---- |
| `/movies/tmdb/550`                 | 733    | 2798 | 2798 |
| `/movies/tmdb/genres`              | 647    | 800  | 800  |
| `/movies/tmdb/search?query=batman` | 810    | 3177 | 3177 |
| `/people/287`                      | 764    | 4042 | 4042 |
| search, 12 different queries       | 2131   | 4399 | 4399 |

`/people/:id` already has a 24 h in-process cache (`PeopleService`); its time
is mostly two Neon lookups, so Redis only helps it after a restart.

### Baseline through the proxy (the one to compare against)

The direct run above lost requests to dropped connections, so the baseline was
repeated through a SOCKS proxy (`ALL_PROXY=socks5h://...`; the script then
uses curl). All 12 of 12 requests succeeded. The proxy adds roughly 400 ms to
every number, so **compare only runs made the same way**.
`docs/perf/baseline-before-redis-proxy.json`:

| Route                              | median | p95  |
| ---------------------------------- | ------ | ---- |
| `/movies/tmdb/550`                 | 1121   | 3343 |
| `/movies/tmdb/genres`              | 1037   | 1302 |
| `/movies/tmdb/search?query=batman` | 1068   | 2336 |
| `/people/287`                      | 1124   | 2381 |

Search with queries the server had never seen (8 queries): 1.6 to 3.9 s,
median about 2.1 s. The "12 distinct queries" row in that JSON is not a clean
cold number: the server's in-memory erotic-title cache was already warm for
those queries.

### Test of the code before it was pushed

`docs/perf/pre-push-service-test.txt`: the new code against live TMDb, with
and without Redis. TMDb calls are counted, which does not depend on network
speed.

| Case (per call, ms)             | cache off     | Redis, empty  | Redis filled, new process |
| ------------------------------- | ------------- | ------------- | ------------------------- |
| movie 550                       | ~500          | 805 then 350  | ~345, 0 TMDb calls        |
| genres                          | ~495          | 824 then 335  | ~340, 0 TMDb calls        |
| search "batman"                 | 1292 then 480 | 1888 then 325 | ~330, 0 TMDb calls        |
| 6 new searches (111 TMDb calls) | 1058 to 1299  | 1640 to 1837  | ~326, 0 TMDb calls        |

Reading it: a hit costs one Redis round trip, about 350 ms from this PC and
expected to be a few ms from Render if the regions match. A miss costs that
round trip on top of the TMDb call. A second request that arrives before the
first one's write has landed is a miss too (seen once, with "batman"). The
big win is search: 18 to 19 TMDb calls per search become none.

An earlier run showed no effect because `connectTimeout` was 3 s and this
PC needs about 4 s to complete the TLS connection; it is now 10 s. Commands
fail immediately while disconnected, so a long connect timeout costs nothing.

### Result on Render, after Redis (commit `4a0ce72`)

Same script, same proxy, 12 requests per route; `after-redis-cold.json` is the
first run (cache empty) and `after-redis-warm.json` the second. Medians, ms.

| Route                              | before | after, cold | after, warm | warm p95 (before p95) |
| ---------------------------------- | ------ | ----------- | ----------- | --------------------- |
| `/movies/tmdb/550`                 | 1121   | 962         | 853         | 1171 (3343)           |
| `/movies/tmdb/genres`              | 1037   | 658         | 635         | 704 (1302)            |
| `/movies/tmdb/search?query=batman` | 1068   | 854         | 879         | 1180 (2336)           |
| `/people/287`                      | 1124   | 1171        | 1095        | 2399 (2381)           |
| search, 12 different queries       | ~2130  | 2070        | 876         | 1212 (4399)           |

`docs/perf/after-redis-fresh-search.txt`: 8 queries never seen before, cold
median about 1860 ms, warm about 846 ms.

- **Search is the clear win**: about 2 s down to about 0.85 s, and the slowest
  requests (3 to 4 s) are gone. A cold miss costs no more than before.
- **Single lookups** (movie, genres) are 20 to 40 % faster; the slow tail
  shrinks the most.
- **`/people/:id` did not change**, as expected: its time is the Neon lookups.
- The warm numbers sit near the proxy-and-database floor (genres, which does
  no database work, is about 635 ms), so Redis from Render is fast enough that
  the region is not a problem.
- Single runs of 12 samples through a proxy are noisy; read the pattern, not
  the last 50 ms.
