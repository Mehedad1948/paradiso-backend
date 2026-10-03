import 'reflect-metadata';
import { Module, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RoomAccessService } from '../rooms/providers/room-access.service';
import { apiControllers } from './controllers';
import { createOpenApiDocument } from './document';

// A metadata-only application: no AppModule, environment validation, database,
// mail or cloud services. Never call listen() or use this module to serve requests.
const dependencies = new Set<Type>([RoomAccessService]);
for (const controller of apiControllers) {
  const tokens = Reflect.getMetadata('design:paramtypes', controller) as Type[];
  for (const token of tokens ?? []) dependencies.add(token);
}
@Module({
  controllers: apiControllers,
  providers: [...dependencies].map((provide) => ({ provide, useValue: {} })),
})
class OpenApiExportModule {}

export function createOpenApiMetadataApp() {
  return NestFactory.create(OpenApiExportModule, { logger: false });
}

export async function exportOpenApi(output = resolve('openapi.json')) {
  const app = await createOpenApiMetadataApp();
  try {
    const document = createOpenApiDocument(app);
    await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
    return document;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  exportOpenApi().then(
    (document) =>
      console.log(
        `Exported ${Object.keys(document.paths).length} paths to openapi.json`,
      ),
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
