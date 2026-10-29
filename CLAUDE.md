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

## Frontend handoff (required in the final response)

The user pastes this backend's final response to a separate frontend agent. So
whenever a task adds, changes or removes anything in the HTTP API (routes,
request or response fields, query params, status codes, auth, validation,
behaviour), end the final response with a **Frontend handoff** section. It
must stand alone: the frontend agent has not seen this conversation or the
backend code. Skip it only when the API is untouched, and then say so in one
line.

Keep it structured and concise: facts, not narrative. Use this shape, omitting
empty parts:

```
## Frontend handoff

Types: openapi.json and generated/api.d.ts are regenerated (or: not needed).
Deploy order: <e.g. migration must be applied to the app DB first / none>.

### New endpoints
- METHOD /path (auth: public | any user | admin)
  Request: <body or query fields, types, limits, defaults>
  200: <response shape, nullability, ordering, omitted cases>
  Errors: <status: when>, ...
  Type: operations['<OperationId>'] / components['schemas']['<Name>']

### Changed endpoints
- METHOD /path: <what changed; old -> new>. Breaking: yes/no.

### Removed / deprecated
- ...

### Behaviour the frontend must know
- <caching, ordering, fallbacks, what is hidden from public reads, ids vs TMDb ids, ...>

### Suggested frontend work
- <concrete next steps, e.g. replace the page-by-page scan with GET /x>
```

Rules for the section:

- Use real field names, types, limits and status codes taken from the code and
  `openapi.json`, not from memory. Name the generated type for each endpoint.
- Mark every breaking change and every new required field explicitly.
- State anything the frontend cannot infer from types: ordering, which items
  are omitted, null versus missing, cache expectations, id kinds (library uuid
  versus TMDb id), error message formats.
- Mention what is not yet live (migration not applied, not deployed) so the
  frontend does not build against a 500.
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
