import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

const DATABASE_CHECK_TIMEOUT_MS = 3000;

export interface HealthStatus {
  status: 'ok';
  database: 'up';
  uptime: number;
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<HealthStatus> {
    // A hung connection must fail the check rather than hang the probe.
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Database check timed out')),
        DATABASE_CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.dataSource.query('SELECT 1'), timeout]);
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    } finally {
      clearTimeout(timer);
    }
    return {
      status: 'ok',
      database: 'up',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
