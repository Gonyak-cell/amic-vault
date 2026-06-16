import { runLocalModelBench, defaultLocalModelBenchEndpoint } from './local-model-bench.ts';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function splitCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const report = await runLocalModelBench({
    enabled: (process.env.AI_BENCH_HARNESS_ENABLED ?? '').trim().toLowerCase() === 'true',
    endpoint: argValue(args, '--endpoint') ?? process.env.AI_BENCH_ENDPOINT ?? defaultLocalModelBenchEndpoint,
    candidateIds: splitCsv(argValue(args, '--models') ?? process.env.AI_BENCH_MODELS),
    fixtureDir: argValue(args, '--dir') ?? 'tests/fixtures/evalset-v0',
    caseLimit: positiveInt(argValue(args, '--case-limit') ?? process.env.AI_BENCH_CASE_LIMIT),
    outputDir: argValue(args, '--output-dir'),
  });
  console.log(JSON.stringify(report, null, 2));
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
