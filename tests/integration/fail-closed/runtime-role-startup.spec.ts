import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface RuntimeResult {
  code: number | null;
  output: string;
}

const runtimeScript = String.raw`
  const role = process.argv[1];
  const run = async () => {
    if (process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || process.env.APP_DATABASE_URL) {
      throw new Error('OWNER_DATABASE_ENV_PRESENT');
    }
    if (role === 'api') {
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require('./apps/api/dist/app.module');
      const { assertRuntimeDatabaseRole } = require('./apps/api/dist/common/db/runtime-role.assertion');
      const { configureApiProcessEnv, configureApp } = require('./apps/api/dist/main');
      configureApiProcessEnv();
      await assertRuntimeDatabaseRole();
      const app = await NestFactory.create(AppModule, { logger: false });
      configureApp(app);
      await app.listen(0, '127.0.0.1');
      await app.close();
    } else {
      const { bootstrapWorker } = require('./apps/api/dist/worker-main');
      const app = await bootstrapWorker();
      await app.close();
    }
    process.stdout.write('RUNTIME_SMOKE_PASS\\n');
  };
  run().catch((error) => {
    process.stderr.write(String(error && error.message ? error.message : error));
    process.exitCode = 1;
  });
`;

function runtimeEnvironment(runtimeUrl: string, role: 'api' | 'worker'): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PROCESS_ROLE: role,
    DATABASE_RUNTIME_URL: runtimeUrl,
    DATABASE_RUNTIME_ROLE: 'vault_app',
    // Startup isolation proves credential separation; queue activation has its
    // own worker-processing suite and would otherwise allocate legacy pools.
    AI_PREP_QUEUE_WORKER_ENABLED: 'false',
    AUDIT_ANCHOR_QUEUE_WORKER_ENABLED: 'false',
    BULK_UPLOAD_QUEUE_WORKER_ENABLED: 'false',
    CONTRACT_AI_REVIEW_QUEUE_WORKER_ENABLED: 'false',
    DD_EXPORT_QUEUE_WORKER_ENABLED: 'false',
    DLP_BULK_DOWNLOAD_MONITOR_WORKER_ENABLED: 'false',
    DOCUMENT_COMPARISON_QUEUE_WORKER_ENABLED: 'false',
    EMAIL_REPARSE_QUEUE_WORKER_ENABLED: 'false',
    EXTRACTION_QUEUE_WORKER_ENABLED: 'false',
    GRAPH_SYNC_OUTBOX_WORKER_ENABLED: 'false',
    LAW_AMENDMENT_REFRESH_WORKER_ENABLED: 'false',
    OCR_QUEUE_WORKER_ENABLED: 'false',
    PREVIEW_CONVERT_QUEUE_WORKER_ENABLED: 'false',
    RETENTION_REVIEW_QUEUE_WORKER_ENABLED: 'false',
    SEARCH_INDEX_QUEUE_WORKER_ENABLED: 'false',
  };
  delete env.DATABASE_MIGRATION_URL;
  delete env.DATABASE_URL;
  delete env.APP_DATABASE_URL;
  return env;
}

async function runRuntime(role: 'api' | 'worker', runtimeUrl: string): Promise<RuntimeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', runtimeScript, role], {
      cwd: process.cwd(),
      env: runtimeEnvironment(runtimeUrl, role),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`runtime ${role} smoke timed out`));
    }, 20_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}

function runtimeUrl(): string {
  const url = process.env.DATABASE_RUNTIME_URL;
  if (!url) throw new Error('DATABASE_RUNTIME_URL_REQUIRED_FOR_RUNTIME_SMOKE');
  return url;
}

describe('runtime role startup isolation', () => {
  it('starts API and worker AppModule paths only with the runtime credential', async () => {
    const api = await runRuntime('api', runtimeUrl());
    const worker = await runRuntime('worker', runtimeUrl());

    expect(api).toMatchObject({ code: 0, output: expect.stringContaining('RUNTIME_SMOKE_PASS') });
    expect(worker).toMatchObject({ code: 0, output: expect.stringContaining('RUNTIME_SMOKE_PASS') });
  }, 20_000);

  it('rejects an owner credential before the API AppModule can start', async () => {
    const ownerUrl = process.env.DATABASE_MIGRATION_URL;
    if (!ownerUrl) throw new Error('DATABASE_MIGRATION_URL_REQUIRED_FOR_RUNTIME_SMOKE');

    const result = await runRuntime('api', ownerUrl);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('RUNTIME_DATABASE_ROLE_INVALID');
    expect(result.output).not.toMatch(/postgres:\/\/|password|amic_vault_dev_password/i);
  }, 20_000);
});
