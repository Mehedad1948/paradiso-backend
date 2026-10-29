# Featured artist of the day

The homepage shows one film artist per day (a director, actor or other crew
member) and the ten days before it. The backend decides; every user sees the
same person on the same UTC day. "Admin" below is the **site-wide `admin`
role** in the access token, not a room admin.

## Endpoints

Public, no token:

- `GET /featured-artists?limit=1..11` (default 11). Item 0 is today. Only item
  0 has `knownFor` (up to 3 films) and `libraryFilmCount`. Open an artist with
  `GET /people/{tmdbPersonId}`. `503` only when no day has ever been picked.

Admin (`401` without a token, `403` for non-admins):

| Endpoint                                        | Purpose                                                   |
| ----------------------------------------------- | --------------------------------------------------------- |
| `GET /admin/featured-artists?from=&to=`         | Days in a range (default ±30, max 120), scheduled included |
| `GET /admin/featured-artists/{date}`            | One day, or `404`                                         |
| `PUT /admin/featured-artists/{date}`            | Set the pick for today or later (`manual`)                |
| `DELETE /admin/featured-artists/{date}`         | Remove the pick for today or later                        |
| `GET /admin/featured-candidates`                | Boosted/blocked people (`boosted`, `blocked`, paginated)  |
| `PUT /admin/featured-candidates/{tmdbPersonId}` | Boost, block or annotate (partial update)                 |
| `DELETE /admin/featured-candidates/{tmdbPersonId}` | Back to default behaviour                              |
| `GET /admin/featured-people/search?query=&page=` | Find a person, with `eligible`, `boost`, `blocked`, `lastFeaturedDate` |
| `GET /admin/featured-people/{id}/preview`       | Score, boost, cooldown, weight and why someone is ineligible |

Status codes: `409` for changing a past day, `422` for a person TMDb does not
know or who has no photo or biography, a boost outside 0–10, or a tagline over
140 / note over 500 characters. Boosts and blocks only affect future picks.

## How the pick is made

At 00:00 UTC a job creates the row for the day, unless one exists (a manual
one is never overwritten). The first public request of a day does the same if
the job failed or has not run; the unique `feature_date` makes concurrent
attempts safe. If selection fails, the newest row is served and an `ALERT` is
logged.

1. **Pool**: people credited on library films, TMDb's popular people, and
   everyone boosted above 1.
2. **Cheap exclusions** (no TMDb call): blocked, photo missing in the popular
   list, featured within `HARD_MIN_GAP_DAYS` (past or scheduled).
3. **Shortlist**: loading a profile costs a TMDb request, so a weighted sample
   of `FEATURED_SHORTLIST_SIZE` people (default 30) is loaded. This keeps one
   draw to about 30 requests however large the pool is.
4. **Eligibility**: photo, biography, at least `MIN_CREDITS` credits (waived
   when boosted above 1).
5. **Weight** = `baseScore × boost × cooldownFactor`. `baseScore` (0–1) blends
   TMDb popularity, votes across their films, credit count and films in our
   library (the largest share; 3 library films earn all of it), with weights from
   `SCORE_WEIGHTS`. `cooldownFactor = min(1, daysSinceLastFeatured / COOLDOWN_DAYS)`.
6. One weighted random draw; the row stores a snapshot of name, photo and
   department.

`HARD_MIN_GAP_DAYS` must be at least 11 so nobody repeats inside the
11-item strip.

## Configuration (environment)

| Variable                     | Default | Meaning                                      |
| ---------------------------- | ------- | -------------------------------------------- |
| `COOLDOWN_DAYS`              | 30      | Length of the cooldown ramp                  |
| `HARD_MIN_GAP_DAYS`          | 14      | Never twice within this many days (min 11)   |
| `MIN_CREDITS`                | 5       | Credits needed unless boosted                |
| `SCORE_WEIGHTS`              | see below | JSON, e.g. `{"library":0.45}`; missing keys keep defaults |
| `FEATURED_SHORTLIST_SIZE`    | 30      | Profiles loaded per draw                     |
| `FEATURED_POPULAR_PAGES`     | 3       | Pages (20 people) of TMDb popular people     |
| `FEATURED_FETCH_CONCURRENCY` | 10      | Parallel TMDb requests                       |

Default `SCORE_WEIGHTS`: `popularity` 0.25, `votes` 0.2, `credits` 0.1,
`library` 0.45. Invalid values stop the app at startup.

## Deploying

The `featured_artist` and `featured_candidate` tables come from
`FeaturedArtists1793836800000`, registered in `scripts/migrate-community.cjs`.
Apply it **before** the new build serves traffic:

```sh
npm run build
node scripts/migrate-community.cjs --apply
```

Caches: TMDb-derived `knownFor` and `libraryFilmCount` are kept in memory for 6
hours per person and cleared when an admin changes today's pick. The pick
itself is read from the database on every request, so a change shows at once
on every instance.
