# Paradiso backend: notes for Claude Code

NestJS + TypeORM on Neon Postgres, deployed on Render. Production has
`synchronize` off, so **schema changes reach it only through migrations**.

## Database migrations (read before touching entities or the schema)

Forgetting or misdirecting a migration has caused production 500s several
times (`favorite_movie.note`, backdrops, curations). A missing table or column
shows up as a generic `500 Internal server error`.

### The two-database trap

`.env.development` holds two different Neon URLs, and they may point at
**different databases**:

| Variable                 | Used by                                  |
| ------------------------ | ---------------------------------------- |
| `NEON_DB` / `DATABASE_URL` | the app, including Render's deployment   |
| `DATABASE_URL_UNPOOLED`  | `scripts/migrate-community.cjs` (first choice) |

The app database is what Render uses, so the migration must hit **the same
endpoint and database name as `NEON_DB`**, using its direct host (the same host
without `-pooler`). The script prints `Target database: host / db` and refuses
to run when that differs from the app's database. Never bypass that with
`--allow-different-database` unless the user says it is deliberate.

### When you add or change a migration

1. Add `src/<feature>/migrations/<timestamp>-<name>.ts` (timestamp after the
   latest one) and register it in `scripts/migrate-community.cjs`: both the
   `require` and the `migrations` array.
2. Entities must match the migration (the integration suite compares their
   shape). Add new entities to the entity list in
   `src/endpoints.integration.spec.ts`, or the whole DB suite fails.
3. Run `npm run build`, then preview with `node scripts/migrate-community.cjs`
   (prints SQL, touches nothing).
4. Run `npm run test:db` (local PostgreSQL, isolated throwaway schema).
5. **Tell the user the migration must be applied to the app database before
   or together with the deploy, and give them the exact command below.**
   Column/table-adding migrations must land before the code that needs them is
   live. Data-reset migrations must rely on a version stamp written only by new
   code (see `detailsVersion` / `DETAILS_VERSION`), not on nulling a column.
6. After the user applies it, verify read-only that the **app** database has
   it (see below). Don't call the work done before that.

### Applying (hand this to the user, PowerShell)

Windows PowerShell 5.1 drops `--` in `npm run x -- --apply`, so the npm script
silently only previews. Use node directly, aimed at the app database:

```powershell
npm run build
$env:DATABASE_URL_UNPOOLED = ((Select-String -Path .env.development -Pattern '^NEON_DB=(.*)$').Matches[0].Groups[1].Value.Trim('"',"'")) -replace '-pooler',''
node scripts/migrate-community.cjs --apply
Remove-Item Env:DATABASE_URL_UNPOOLED
```

Expect `Target database: <app host> / <db>` then `Migrations applied
successfully.` Already-applied migrations are skipped (recorded in the
`community_migrations` table).

### Verifying (read-only)

Check the database the app reads, not the one the script used:
`select name from community_migrations order by id desc limit 3` and
`to_regclass('public.<table>')` via `pg` with `NEON_DB`. Print only host and
database name, never the URL or password.

### Production is the user's call

Changing the production database is blocked by the permission classifier and
must not be worked around. Prepare the command, explain it, and let the user
run it (or add a permission rule). Never print or repeat connection strings or
passwords; if the user pastes one, suggest rotating it.

## Final response format (every task)

The final response has up to two parts, in this order.

### 1. Brief for the user

Concise, for the person who reads it now: what changed and why, how it was
verified (what ran, what did not), decisions that go beyond the request, and
anything the user must do next (migrations to apply, deploys, rotated secrets,
open questions). Short sections or bullets; no narrative of the process.

### 2. Frontend agent handoff (only when the HTTP API changed)

The user copies this part to a **separate frontend coding agent**, an AI that
has not seen this conversation or this repository. Write it as a spec addressed
to that agent, not as a status report for a team: state exactly what the API now
does and what it should change in the frontend. Put it **last**, under a heading
the user can copy from, and make it self-contained.

Include it whenever routes, DTOs, request or response fields, query params,
status codes, auth, validation or observable behaviour changed. If the API is
untouched, write one line: "No API changes, no frontend handoff."

Shape (omit empty parts):

```
## Handoff for the frontend agent

Context: <one or two sentences: the feature and the user-visible goal>
Status: <live | deployed but migration pending | local only>. Types: regenerate
from openapi.json (or: no regeneration needed).

### API contract
- METHOD /path  (auth: public | signed-in | admin)
  Request: <body/query fields with types, limits, defaults; "none">
  Response 200: <shape, nullability, ordering, what is omitted>
  Errors: <status: condition (message format)>, ...
  Generated type: operations['<OperationId>'] / components['schemas']['<Name>']

### Changes to existing endpoints
- METHOD /path: <old -> new>. Breaking: yes/no.

### Rules the types do not express
- <ordering, omitted items, null vs missing, id kinds (library uuid vs TMDb id),
  caching and who invalidates, fallbacks, error message formats>

### Tasks for the frontend agent
1. <imperative, concrete: "Replace X with GET /y", "Add admin screen Z using ...">
2. ...
Do not: <things it must not assume or change, e.g. do not add client-side caching
the spec forbids>
```

Rules for the handoff:

- Take field names, types, limits and status codes from the code and
  `openapi.json`, not from memory. Name the generated type for every endpoint.
- Mark every breaking change and every new required field explicitly.
- Say what is not yet live (migration not applied, not deployed) so the
  frontend agent does not build against a 500.
- Tasks are imperative and ordered; each is something the agent can do without
  asking back.
- No secrets, connection strings or local file paths in it.

## Other conventions

- OpenAPI: after changing routes, DTOs or `src/openapi/response-schemas.ts`,
  run `npm run api:types` and commit `openapi.json` and `generated/api.d.ts`
  (`npm test` fails if they are stale). See `docs/openapi.md`.
- New controllers must be added to `src/openapi/controllers.ts`.
- Features follow the featured-artists layout: controller(s), service (rules),
  store (SQL), DTOs, entities, `migrations/`, a doc in `docs/`.
- Match prettier (`npm run format`); Python/other scripts must not rewrite
  files with CRLF endings.
