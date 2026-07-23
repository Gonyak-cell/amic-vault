import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { Client } from 'pg';
import { runtimeSecretValue } from '../../common/config/runtime-secret';
import { Public } from '../auth/public.decorator';

export type ReadinessProbe = () => Promise<boolean>;
export const READINESS_PROBE = Symbol('READINESS_PROBE');

interface ResponseLike {
  status(code: number): void;
}

export function createDefaultReadinessProbe(env: NodeJS.ProcessEnv = process.env): ReadinessProbe {
  return async () => {
    let connectionString: string;
    try {
      connectionString = runtimeSecretValue('DATABASE_RUNTIME_URL', env, {
        maximumBytes: 4096,
      });
    } catch {
      return false;
    }
    const client = new Client({ connectionString, connectionTimeoutMillis: 1000 });
    const timeout = new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), 1000);
    });
    return Promise.race([
      (async () => {
        try {
          await client.connect();
          await client.query('SELECT 1');
          return true;
        } catch {
          return false;
        } finally {
          await client.end().catch(() => undefined);
        }
      })(),
      timeout,
    ]);
  };
}

function defaultReadinessProbe(): Promise<boolean> {
  return createDefaultReadinessProbe()();
}

@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    @Inject(READINESS_PROBE)
    private readonly readinessProbe: ReadinessProbe = defaultReadinessProbe,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: ResponseLike) {
    const ready = await this.readinessProbe();
    if (!ready) {
      response.status(503);
      return { status: 'unready' };
    }
    return { status: 'ok' };
  }
}
