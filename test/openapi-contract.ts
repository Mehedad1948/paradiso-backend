import { OpenAPIObject } from '@nestjs/swagger';
import {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { operationResponses } from '../src/openapi/response-schemas';

// Check real serialized HTTP responses against the supported schema features.
// Throw on unknown references and unsupported types rather than passing silently.
export function assertOpenApiResponse(
  document: OpenAPIObject,
  operationId: string,
  body: unknown,
) {
  const schema = document.components!.schemas![operationResponses[operationId]];
  const check = (
    schema: SchemaObject | ReferenceObject,
    value: unknown,
    path: string,
  ): void => {
    if ('$ref' in schema) {
      const target =
        document.components!.schemas![schema.$ref.split('/').at(-1)!];
      expect(target).toBeDefined();
      return check(target, value, path);
    }
    if (value === null && schema.nullable) return;
    if (schema.oneOf) {
      const matches = schema.oneOf.filter((candidate) => {
        try {
          check(candidate, value, path);
          return true;
        } catch {
          return false;
        }
      });
      expect({ path, matches: matches.length }).toEqual({ path, matches: 1 });
      return;
    }
    if (schema.enum) expect(schema.enum).toContain(value);
    switch (schema.type) {
      case 'object': {
        expect({
          path,
          isObject:
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value),
        }).toEqual({ path, isObject: true });
        const obj = value as Record<string, unknown>;
        for (const key of schema.required ?? [])
          expect({
            path: `${path}.${key}`,
            present: Object.hasOwn(obj, key),
          }).toEqual({ path: `${path}.${key}`, present: true });
        for (const [key, child] of Object.entries(schema.properties ?? {}))
          if (Object.hasOwn(obj, key)) check(child, obj[key], `${path}.${key}`);
        return;
      }
      case 'array':
        expect({ path, isArray: Array.isArray(value) }).toEqual({
          path,
          isArray: true,
        });
        for (const [i, item] of (value as unknown[]).entries())
          check(schema.items!, item, `${path}[${i}]`);
        return;
      case 'string':
      case 'boolean':
      case 'number':
        expect({ path, type: typeof value }).toEqual({
          path,
          type: schema.type,
        });
        return;
      case 'integer':
        expect({ path, isInteger: Number.isInteger(value) }).toEqual({
          path,
          isInteger: true,
        });
        return;
      default:
        throw new Error(`Unsupported schema type at ${path}: ${schema.type}`);
    }
  };
  expect(schema).toBeDefined();
  check(schema, body, operationId);
}
