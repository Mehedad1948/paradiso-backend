# OpenAPI and frontend contracts

Run the server as usual and open `/docs` for Swagger UI. Download the standard
OpenAPI 3.0 JSON document at `/openapi.json`. For local development these are
`http://localhost:3000/docs` and `http://localhost:3000/openapi.json`.
Use **Authorize** with an access JWT to try protected endpoints. Public operations
have no authentication requirement; administrative operations state the required
role. The documentation endpoints are public. Set `OPENAPI_ENABLED=false` to
disable both the UI and document on a deployment.

## Generate without running the backend

```sh
npm run api:types
```

This builds the backend, exports `openapi.json`, and generates `generated/api.d.ts`.
Export requires no database, mail service, cloud credentials or `.env` file.
For JSON only, use `npm run openapi:export`.

Commit both generated files after changing API contracts. `npm test` checks that
the JSON matches controller/DTO metadata. `npm run api:check` checks that the
generated TypeScript matches the JSON. Do not edit generated files by hand.

## Use in the frontend

Copy `openapi.json` into the frontend repository, then generate its own types:

```sh
npm install --save-dev openapi-typescript
npx openapi-typescript ./openapi.json -o src/generated/api.d.ts
```

You can also generate from the running server:

```sh
npx openapi-typescript http://localhost:3000/openapi.json -o src/generated/api.d.ts
```

Use the generated types with your existing request library:

```ts
import type { components, operations } from './generated/api';

type AddRatingRequest = components['schemas']['AddRatingDto'];
type AddRatingResponse =
  operations['Ratings_addRating']['responses'][201]['content']['application/json'];
type RoomRatingQuery =
  operations['Rooms_getRoomRatings']['parameters']['query'];

const body: AddRatingRequest = { movieId: movie.id, rate: 8 };
```

For automatic path, query, body and response inference, a client such as
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/) can consume the generated
`paths` type:

```ts
import createClient from 'openapi-fetch';
import type { paths } from './generated/api';

const api = createClient<paths>({ baseUrl: 'https://api.your-domain.com' });
const { data, error } = await api.POST('/ratings/{id}', {
  params: { path: { id: roomId } },
  headers: { Authorization: `Bearer ${accessToken}` },
  body: { movieId: movie.id, rate: 8 },
});
// data is the documented response, including apiVersion.
```

Install `openapi-fetch` in the frontend if using that example. Type generation
does not configure cross-origin access: a frontend on a different origin still
needs an allowed CORS origin on the server or a same-origin reverse proxy.

## Maintaining the document

- Request properties and validation limits are declared on DTOs with
  `ApiProperty` / `ApiPropertyOptional`. Import Swagger mapped types from
  `@nestjs/swagger` so updates and combined query DTOs preserve their schemas.
- `src/openapi/response-schemas.ts` describes serialized responses, including
  `apiVersion`, pagination and the endpoint-specific projections of relations.
  It deliberately does not expose user database entities or private fields.
- Response contracts are keyed by stable operation IDs. A missing contract,
  duplicate ID or removed route causes export to fail. Register new controllers
  in `src/openapi/controllers.ts` for offline export.
- PostgreSQL integration tests check real movie, room, rating and invitation
  responses against these schemas with `npm run test:db`.
- TMDB schemas describe core fields and allow additional upstream fields.
  Generated TypeScript is a compile-time contract; it does not validate API
  responses at runtime. Dates and UUIDs are strings in generated types.
