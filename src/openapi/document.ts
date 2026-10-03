import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AUTH_TYPE_KEY, ROLES_KEY } from '../auth/constants/auth.constants';
import { AuthType } from '../auth/enums/auth.decorator';
import { apiControllers } from './controllers';
import { operationResponses, ref, responseSchemas } from './response-schemas';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Paradiso API')
    .setDescription(
      'Movie sharing, rooms, ratings and invitations. Successful responses include apiVersion. Use an access token with Authorize; refresh tokens are only for /auth/refresh-tokens.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'accessToken',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  document.components ??= {};
  // Body DTOs use forbidNonWhitelisted validation: extra fields are rejected.
  for (const schema of Object.values(document.components.schemas ?? {})) {
    if ('type' in schema && schema.type === 'object')
      schema.additionalProperties = false;
  }
  document.components.schemas = {
    ...document.components.schemas,
    ...responseSchemas,
  };
  const seen = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
      'head',
    ] as const) {
      const operation = item[method];
      if (!operation) continue;
      const id = operation.operationId!;
      const response = operationResponses[id];
      if (!response)
        throw new Error(`Missing OpenAPI response contract for ${id}`);
      if (seen.has(id))
        throw new Error(`Duplicate OpenAPI operation ID: ${id}`);
      seen.add(id);
      const controller = apiControllers.find((c) =>
        id.startsWith(`${c.name.replace(/Controller$/, '')}_`),
      );
      if (!controller)
        throw new Error(`Missing controller in OpenAPI manifest: ${id}`);
      const handler = controller.prototype[
        id.slice(id.indexOf('_') + 1)
      ] as object;
      const auth = (Reflect.getMetadata(AUTH_TYPE_KEY, handler) ??
        Reflect.getMetadata(AUTH_TYPE_KEY, controller)) as
        | AuthType[]
        | undefined;
      const isPublic = auth?.includes(AuthType.none) ?? false;
      operation.security = isPublic ? [] : [{ accessToken: [] }];
      operation.tags = [controller.name.replace(/Controller$/, '')];
      operation.summary ??= id
        .slice(id.indexOf('_') + 1)
        .replace(/([a-z])([A-Z])/g, '$1 $2');
      const roles = (Reflect.getMetadata(ROLES_KEY, handler) ??
        Reflect.getMetadata(ROLES_KEY, controller)) as string[] | undefined;
      if (roles?.length)
        operation.description =
          `${operation.description ?? ''}\nRequires role: ${roles.join(', ')}.`.trim();
      const success =
        Object.keys(operation.responses).find((code) => code.startsWith('2')) ??
        (method === 'post' ? '201' : '200');
      operation.responses = {
        [id === 'GoogleAuthentication_authenticate' ? '501' : success]: {
          description:
            id === 'GoogleAuthentication_authenticate'
              ? 'Google authentication is not configured.'
              : 'Successful response',
          content: { 'application/json': { schema: ref(response) } },
        },
        default: {
          description: 'Error response',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      };
      for (const p of operation.parameters ?? []) {
        if (!('in' in p) || p.in !== 'path') continue;
        const parameter = p;
        if (
          parameter.name === 'token' ||
          path.startsWith('/movies/{id}') ||
          path === '/ratings/movie/{id}' ||
          path.startsWith('/genres/{id}')
        ) {
          parameter.schema = { type: 'string', format: 'uuid' };
        } else if (
          parameter.name !== 'userId' ||
          path.startsWith('/community/')
        ) {
          parameter.schema = { type: 'integer', minimum: 1 };
        }
      }
    }
  }
  for (const id of Object.keys(operationResponses)) {
    if (!seen.has(id))
      throw new Error(`OpenAPI contract has no matching route: ${id}`);
  }
  return document;
}

export function setupOpenApi(app: INestApplication) {
  // OPENAPI_ENABLED=false disables the UI and JSON endpoint, but not offline export.
  if (process.env.OPENAPI_ENABLED === 'false') return;
  SwaggerModule.setup('docs', app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: '/openapi.json',
    swaggerOptions: { persistAuthorization: false },
  });
}
