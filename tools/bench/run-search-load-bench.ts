import {
  runSearchLoadBench,
  type SearchLoadBenchMode,
} from './search-load-bench.ts';

const defaultTenantId = '11111111-1111-4111-8111-111111111111';
const defaultScaleAdminUserId = '11111111-1111-4111-8111-111111111100';
const defaultScaleAdminEmail = 'alpha-firm-admin@test.local';
const defaultScaleAdminPassword = 'dev-alpha-firm-admin-password';
const defaultDatabaseUrl = 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function splitModes(value: string | undefined): SearchLoadBenchMode[] {
  if (!value) return ['keyword'];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(isSearchLoadBenchMode);
}

function isSearchLoadBenchMode(value: string): value is SearchLoadBenchMode {
  return value === 'keyword' || value === 'hybrid';
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const query = argValue(args, '--query') ?? process.env.D9_SEARCH_BENCH_QUERY ?? 'd9scale';
  const seedEnabled = hasFlag(args, '--seed-synthetic') || process.env.D9_SEARCH_BENCH_SEED === 'true';
  const documentCount = positiveInt(
    argValue(args, '--document-count') ?? process.env.D9_SEARCH_BENCH_DOCUMENT_COUNT,
    0,
  );
  const report = await runSearchLoadBench({
    enabled: process.env.D9_SEARCH_BENCH_ENABLED === 'true' || hasFlag(args, '--enabled'),
    apiBaseUrl: argValue(args, '--api-base-url') ?? process.env.D9_SEARCH_BENCH_API_BASE_URL ?? 'http://127.0.0.1:3001',
    tenantId: argValue(args, '--tenant-id') ?? process.env.D9_SEARCH_BENCH_TENANT_ID ?? defaultTenantId,
    email: argValue(args, '--email') ?? process.env.D9_SEARCH_BENCH_EMAIL ?? defaultScaleAdminEmail,
    password:
      argValue(args, '--password') ?? process.env.D9_SEARCH_BENCH_PASSWORD ?? defaultScaleAdminPassword,
    query,
    modes: splitModes(argValue(args, '--modes') ?? process.env.D9_SEARCH_BENCH_MODES),
    samples: positiveInt(argValue(args, '--samples') ?? process.env.D9_SEARCH_BENCH_SAMPLES, 3),
    concurrency: positiveInt(
      argValue(args, '--concurrency') ?? process.env.D9_SEARCH_BENCH_CONCURRENCY,
      1,
    ),
    pageSize: positiveInt(argValue(args, '--page-size') ?? process.env.D9_SEARCH_BENCH_PAGE_SIZE, 10),
    outputDir: argValue(args, '--output-dir'),
    seed: seedEnabled
      ? {
          enabled: true,
          databaseUrl:
            argValue(args, '--database-url') ??
            process.env.DATABASE_URL ??
            process.env.D9_SEARCH_BENCH_DATABASE_URL ??
            defaultDatabaseUrl,
          documentCount,
          batchSize: positiveInt(
            argValue(args, '--batch-size') ?? process.env.D9_SEARCH_BENCH_BATCH_SIZE,
            1_000,
          ),
          tenantId:
            argValue(args, '--tenant-id') ?? process.env.D9_SEARCH_BENCH_TENANT_ID ?? defaultTenantId,
          ownerUserId:
            argValue(args, '--user-id') ??
            process.env.D9_SEARCH_BENCH_USER_ID ??
            defaultScaleAdminUserId,
          query,
        }
      : undefined,
    recordScale: hasFlag(args, '--record-scale') || process.env.D9_SEARCH_BENCH_RECORD_SCALE === 'true',
  });
  console.log(JSON.stringify(report, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
