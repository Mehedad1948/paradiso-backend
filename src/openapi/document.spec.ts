import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { Server } from 'node:http';
import { resolve } from 'node:path';
import * as request from 'supertest';
import { createOpenApiDocument, setupOpenApi } from './document';
import { createOpenApiMetadataApp } from './export';
import { operationResponses } from './response-schemas';

describe('OpenAPI frontend contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const enabled = process.env.OPENAPI_ENABLED;

  beforeAll(async () => {
    process.env.OPENAPI_ENABLED = 'true';
    app = await createOpenApiMetadataApp();
    document = createOpenApiDocument(app);
    setupOpenApi(app);
    await app.init();
  });
  afterAll(async () => {
    if (enabled === undefined) delete process.env.OPENAPI_ENABLED;
    else process.env.OPENAPI_ENABLED = enabled;
    await app?.close();
  });

  it('exports every operation with unique IDs and resolvable references', () => {
    const ids = Object.values(document.paths).flatMap((item) =>
      Object.values(item)
        .filter(
          (value: unknown) =>
            typeof value === 'object' &&
            value !== null &&
            'operationId' in value,
        )
        .map((value) => value.operationId as string),
    );
    expect(ids.sort()).toEqual(Object.keys(operationResponses).sort());
    function check(value: unknown) {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value) {
        const pointer = (value as { $ref: string }).$ref;
        expect(pointer.startsWith('#/components/schemas/')).toBe(true);
        expect(
          document.components?.schemas?.[pointer.split('/').at(-1)!],
        ).toBeDefined();
      }
      for (const child of Object.values(value)) check(child);
    }
    check(document);
  });

  it('documents required fields, nested genre validation and partial updates', () => {
    const schemas = document.components!.schemas!;
    expect(schemas.CreateMovieDto).toMatchObject({
      required: ['title', 'dbId'],
      additionalProperties: false,
      properties: {
        dbId: { type: 'integer', minimum: 1 },
        genres: {
          type: 'array',
          maxItems: 100,
          items: { $ref: '#/components/schemas/MovieGenreDto' },
        },
      },
    });
    expect(schemas.MovieGenreDto).toMatchObject({
      required: ['id'],
      properties: { id: { type: 'integer', minimum: 1 } },
    });
    const update = schemas.UpdateMovieDto;
    expect(update).not.toHaveProperty('required');
    expect(update).not.toHaveProperty('properties.dbId');
    expect(schemas.UpdateUserDto).toMatchObject({
      properties: { password: { minLength: 6, writeOnly: true } },
    });
    expect(schemas.UpdateUserDto).not.toHaveProperty(
      'properties.password.nullable',
    );
  });

  it('documents filter enums, pagination defaults, IDs and DELETE bodies', () => {
    const query = document.paths['/rooms/{roomId}/rating'].get!.parameters!;
    expect(query).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          required: false,
          schema: expect.objectContaining({
            type: 'integer',
            default: 10,
            maximum: 100,
          }),
        }),
        expect.objectContaining({
          name: 'sortBy',
          schema: expect.objectContaining({ enum: ['rate', 'userRate'] }),
        }),
        expect.objectContaining({
          name: 'isWatchTogether',
          schema: expect.objectContaining({ type: 'boolean' }),
        }),
      ]),
    );
    expect(document.paths['/movies/{id}'].get!.parameters).toContainEqual({
      name: 'id',
      required: true,
      in: 'path',
      schema: { type: 'string', format: 'uuid' },
    });
    expect(
      document.paths['/rooms/delete-movie/{id}'].delete!.requestBody,
    ).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RemoveRoomMovieDto' },
        },
      },
    });
  });

  it('matches public routes, bearer auth, admin restrictions and HTTP statuses', () => {
    expect(document.paths['/movies'].get!.security).toEqual([]);
    expect(document.paths['/movies'].post!.security).toEqual([
      { accessToken: [] },
    ]);
    expect(document.paths['/auth/sign-in'].post!.responses).toHaveProperty(
      '200',
    );
    expect(
      document.paths['/auth/refresh-tokens'].post!.responses,
    ).toHaveProperty('201');
    expect(document.paths['/roles'].post!.description).toContain('admin');
    expect(
      document.paths['/auth/google-authentication'].post!.security,
    ).toEqual([]);
    expect(
      document.paths['/auth/google-authentication'].post!.responses,
    ).toHaveProperty('501');
    expect(
      document.paths['/auth/google-authentication'].post!.responses,
    ).not.toHaveProperty('201');
  });

  it('documents multipart uploads and excludes private fields from responses', () => {
    expect(document.paths['/uploads/file'].post!.requestBody).toMatchObject({
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            required: ['file'],
            properties: { file: { type: 'string', format: 'binary' } },
          },
        },
      },
    });
    const schemas = document.components!.schemas!;
    for (const response of new Set(Object.values(operationResponses))) {
      const text = JSON.stringify(schemas[response]);
      expect(text).not.toMatch(/password|verificationCode/);
      if (response !== 'ErrorResponse')
        expect(schemas[response]).toHaveProperty('properties.apiVersion');
    }
    expect(schemas.PublicUser).not.toHaveProperty('properties.email');
    expect(schemas.PublicUser).not.toHaveProperty('properties.password');
  });

  it('keeps the committed JSON contract current', () => {
    const exported = JSON.parse(
      readFileSync(resolve(__dirname, '../../openapi.json'), 'utf8'),
    ) as unknown;
    expect(exported).toEqual(document);
  });

  it('serves the Swagger UI and raw JSON without API authentication', async () => {
    const result = await request(app.getHttpServer() as Server)
      .get('/openapi.json')
      .expect(200);
    expect(result.body).toEqual(document);
    const ui = await request(app.getHttpServer() as Server)
      .get('/docs/')
      .expect(200);
    expect(ui.text).toContain('Swagger UI');
  });
});
