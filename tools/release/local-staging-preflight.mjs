#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const repoRoot = process.cwd();
const frozenReleaseSha =
  process.env.FROZEN_RELEASE_SHA ?? '9e346d9e48c962448bcccbbef9e30d9c3e468e4f';
const shortSha = frozenReleaseSha.slice(0, 12);
const args = new Set(process.argv.slice(2));

const config = {
  dryRun: args.has('--dry-run'),
  json: args.has('--json'),
  keepCompose: args.has('--keep-compose'),
  skipDockerImages: args.has('--skip-docker-images'),
  skipLocalSmoke: args.has('--skip-local-smoke'),
  verboseServers: args.has('--verbose-servers'),
  apiPort: Number(process.env.LOCAL_PREFLIGHT_API_PORT ?? 3101),
  webPort: Number(process.env.LOCAL_PREFLIGHT_WEB_PORT ?? 3100),
  postgresPort: Number(process.env.LOCAL_PREFLIGHT_POSTGRES_PORT ?? 55432),
  minioApiPort: Number(process.env.LOCAL_PREFLIGHT_MINIO_API_PORT ?? 9100),
  minioConsolePort: Number(process.env.LOCAL_PREFLIGHT_MINIO_CONSOLE_PORT ?? 9101),
  ingestionPort: Number(process.env.LOCAL_PREFLIGHT_INGESTION_PORT ?? 8100),
};

const plannedSteps = [
  'Verify frozen release SHA exists',
  'Install dependencies with frozen lockfile',
  'Run lint, typecheck, unit tests, and build',
  'Verify launch readiness, launch execution, docs freeze, and backlog',
  'Build API, Web, and ingestion Docker images with local-preflight tags',
  'Start isolated local dev infrastructure with Docker Compose',
  'Run migrate, rollback, migrate, and seed against isolated local DB',
  'Start API and Web from built artifacts on isolated local ports',
  'Run authenticated local smoke checks with the frozen release SHA',
  'Tear down local server processes and Docker Compose volumes',
];

if (config.dryRun) {
  printSummary({ status: 'dry-run', frozenReleaseSha, steps: plannedSteps });
  process.exit(0);
}

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: 'amic-vault-local-preflight',
  POSTGRES_PORT: String(config.postgresPort),
  MINIO_API_PORT: String(config.minioApiPort),
  MINIO_CONSOLE_PORT: String(config.minioConsolePort),
  INGESTION_WORKER_PORT: String(config.ingestionPort),
};

const serviceEnv = {
  ...process.env,
  DATABASE_URL: localDatabaseUrl(),
  APP_DATABASE_URL: localDatabaseUrl(),
  S3_ENDPOINT: `http://127.0.0.1:${config.minioApiPort}`,
  S3_BUCKET: 'amic-vault-dev',
  INGESTION_WORKER_URL: `http://127.0.0.1:${config.ingestionPort}`,
};

const apiBaseUrl = `http://127.0.0.1:${config.apiPort}/v1`;
const webBaseUrl = `http://127.0.0.1:${config.webPort}`;
const startedServers = [];
const completedSteps = [];

try {
  step('PRE-001', 'Verify frozen release SHA exists', () =>
    run('git', ['cat-file', '-e', `${frozenReleaseSha}^{commit}`]),
  );
  step('PRE-002', 'Install dependencies with frozen lockfile', () =>
    run('pnpm', ['install', '--frozen-lockfile']),
  );
  step('PRE-003', 'Run lint', () => run('pnpm', ['lint']));
  step('PRE-004', 'Run typecheck', () => run('pnpm', ['typecheck']));
  step('PRE-005', 'Run unit tests', () => run('pnpm', ['test']));
  step('PRE-006', 'Run build', () => run('pnpm', ['build']));
  step('PRE-007', 'Run launch readiness validator', () => run('pnpm', ['launch:readiness']));
  step('PRE-008', 'Run launch execution validator', () => run('pnpm', ['launch:execution']));
  step('PRE-009', 'Run docs package freeze check', () => run('pnpm', ['docs:frozen']));
  step('PRE-010', 'Run backlog validator', () => run('pnpm', ['backlog:validate']));

  if (!config.skipDockerImages) {
    step('PRE-011', 'Build API Docker image', () =>
      run('docker', ['build', '-f', 'apps/api/Dockerfile', '-t', `amic-vault-local-preflight/api:${shortSha}`, '.']),
    );
    step('PRE-012', 'Build Web Docker image', () =>
      run('docker', ['build', '-f', 'apps/web/Dockerfile', '-t', `amic-vault-local-preflight/web:${shortSha}`, '.']),
    );
    step('PRE-013', 'Build ingestion Docker image', () =>
      run('docker', [
        'build',
        '-f',
        'workers/ingestion/Dockerfile',
        '-t',
        `amic-vault-local-preflight/ingestion:${shortSha}`,
        '.',
      ]),
    );
  } else {
    record('PRE-011', 'Build Docker images', 'skip', { reason: 'skip-docker-images flag' });
  }

  step('PRE-014', 'Start isolated local dev infrastructure', () =>
    run('docker', ['compose', '-f', 'infra/docker-compose.dev.yml', 'up', '-d', '--wait'], { env: composeEnv }),
  );
  step('PRE-015', 'Run database migrations', () => run('pnpm', ['db:migrate'], { env: serviceEnv }));
  step('PRE-016', 'Run database rollback', () => run('pnpm', ['db:rollback'], { env: serviceEnv }));
  step('PRE-017', 'Re-run database migrations', () => run('pnpm', ['db:migrate'], { env: serviceEnv }));
  step('PRE-018', 'Seed isolated local database', () => run('pnpm', ['db:seed'], { env: serviceEnv }));

  if (!config.skipLocalSmoke) {
    await step('PRE-019', 'Start API and Web services', async () => {
      const api = startServer('api', ['--filter', '@amic-vault/api', 'start'], {
        ...serviceEnv,
        API_PORT: String(config.apiPort),
        WEB_ORIGIN: webBaseUrl,
        NODE_ENV: 'development',
      });
      const web = startServer(
        'web',
        ['--filter', '@amic-vault/web', 'exec', 'next', 'start', '-H', '127.0.0.1', '-p', String(config.webPort)],
        {
          ...process.env,
          NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
          NODE_ENV: 'production',
        },
      );
      startedServers.push(api, web);
      await waitForHttp(`${apiBaseUrl}/health/ready`, 'API ready health');
      await waitForHttp(`${webBaseUrl}/login`, 'Web login page');
    });
    step('PRE-020', 'Run local authenticated smoke checks', () =>
      run('pnpm', ['release:smoke', '--', '--local'], {
        env: {
          ...serviceEnv,
          API_BASE_URL: apiBaseUrl,
          WEB_BASE_URL: webBaseUrl,
          RELEASE_SHA: frozenReleaseSha,
          FROZEN_RELEASE_SHA: frozenReleaseSha,
          SMOKE_TARGET_REF: 'local-staging-preflight',
          SMOKE_REQUIRE_AUTH: '1',
          SMOKE_TIMEOUT_MS: '15000',
        },
      }),
    );
  } else {
    record('PRE-019', 'Local smoke execution', 'skip', { reason: 'skip-local-smoke flag' });
  }

  printSummary({
    status: 'pass',
    frozenReleaseSha,
    targetRef: 'local-staging-preflight',
    steps: completedSteps,
  });
} catch (error) {
  printServerLogs();
  printSummary({
    status: 'fail',
    frozenReleaseSha,
    targetRef: 'local-staging-preflight',
    steps: completedSteps,
    error: error instanceof Error ? error.message : 'unknown failure',
  });
  process.exitCode = 1;
} finally {
  await stopServers();
  if (!config.keepCompose) {
    const result = spawnSync('docker', ['compose', '-f', 'infra/docker-compose.dev.yml', 'down', '-v'], {
      cwd: repoRoot,
      env: composeEnv,
      encoding: 'utf8',
      stdio: config.json ? 'pipe' : 'inherit',
    });
    if (result.status !== 0) process.exitCode = process.exitCode || result.status || 1;
  }
}

function localDatabaseUrl() {
  return `postgres://amic_vault:amic_vault_dev_password@127.0.0.1:${config.postgresPort}/amic_vault`;
}

function step(id, name, fn) {
  const startedAt = Date.now();
  log(`\n[${id}] ${name}`);
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => record(id, name, 'pass', { durationMs: Date.now() - startedAt }));
  }
  record(id, name, 'pass', { durationMs: Date.now() - startedAt });
}

function record(id, name, status, evidence) {
  completedSteps.push({ id, name, status, evidence });
}

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(' ');
  log(`$ ${printable}`);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: options.env ?? process.env,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${printable} exited with status ${result.status}`);
  }
}

function startServer(name, commandArgs, env) {
  log(`$ pnpm ${commandArgs.join(' ')}`);
  const child = spawn('pnpm', commandArgs, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const capture = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.length > 80) logs.shift();
    if (config.verboseServers) process.stdout.write(`[${name}] ${text}`);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) logs.push(`\n${name} exited with code ${code}\n`);
    if (signal) logs.push(`\n${name} exited with signal ${signal}\n`);
  });
  return { name, child, logs };
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 45_000;
  let lastError = '';
  while (Date.now() < deadline) {
    for (const server of startedServers) {
      if (server.child.exitCode !== null) {
        throw new Error(`${server.name} exited before ${label} became ready`);
      }
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      lastError = `${label} returned status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function stopServers() {
  await Promise.all(
    startedServers.map(
      (server) =>
        new Promise((resolve) => {
          if (server.child.exitCode !== null) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            server.child.kill('SIGKILL');
            resolve();
          }, 5_000);
          server.child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          server.child.kill('SIGTERM');
        }),
    ),
  );
}

function printServerLogs() {
  for (const server of startedServers) {
    if (server.logs.length === 0) continue;
    console.error(`\n--- ${server.name} recent output ---`);
    console.error(server.logs.join('').slice(-6000));
  }
}

function printSummary(summary) {
  if (config.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`\nAMIC Vault local staging preflight: ${summary.status}`);
  console.log(`releaseSha=${summary.frozenReleaseSha}`);
  if (summary.targetRef) console.log(`targetRef=${summary.targetRef}`);
  if (summary.error) console.log(`error=${summary.error}`);
}

function log(message) {
  if (!config.json) console.log(message);
}
