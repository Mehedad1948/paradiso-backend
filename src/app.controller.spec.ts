import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    dataSource.query.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok when the database responds', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      await expect(appController.health()).resolves.toMatchObject({
        status: 'ok',
        database: 'up',
      });
      expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns 503 when the database is unreachable', async () => {
      dataSource.query.mockRejectedValue(new Error('connection refused'));
      await expect(appController.health()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
