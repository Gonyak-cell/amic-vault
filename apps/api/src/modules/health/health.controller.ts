import { Controller, Get, Res } from '@nestjs/common';
import { Client } from 'pg';
import { Public } from '../auth/public.decorator';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export type ReadinessProbe = () => Promise<boolean>;

interface ResponseLike {
  status(code: number): void;
}

async function defaultReadinessProbe(): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
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
}

@Controller('health')
export class HealthController {
  constructor(private readonly readinessProbe: ReadinessProbe = defaultReadinessProbe) {}

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
