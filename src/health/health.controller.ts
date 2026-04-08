import { Controller, Get, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  @Get()
  async check() {
    let dbStatus = 'unknown';
    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
      },
    };
  }

  /** Somente desenvolvimento: dispara erro real para validar o Sentry. Em outros ambientes retorna 404. */
  @Get('__sentry_smoke')
  sentrySmoke() {
    if (process.env.NODE_ENV !== 'development') {
      throw new NotFoundException();
    }
    throw new Error('Sentry smoke test');
  }
}
