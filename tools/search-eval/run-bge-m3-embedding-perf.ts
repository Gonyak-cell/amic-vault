#!/usr/bin/env node
const endpoint = process.env.LOCAL_EMBEDDING_ENDPOINT ?? 'http://127.0.0.1:11434';
const model = process.env.LOCAL_EMBEDDING_MODEL ?? 'bge-m3';
const runs = positiveIntEnv('D2_EMBED_SINGLE_RUNS', 20);
const chunkCount = positiveIntEnv('D2_EMBED_DOCUMENT_CHUNKS', 50);
const timeoutMs = positiveIntEnv('LOCAL_EMBEDDING_TIMEOUT_MS', 30_000);

if (process.argv.includes('--help')) {
  console.log(
    [
      'Usage: pnpm search:perf:bge-m3',
      'Environment:',
      '  LOCAL_EMBEDDING_ENDPOINT=http://127.0.0.1:11434',
      '  LOCAL_EMBEDDING_MODEL=bge-m3',
      '  LOCAL_EMBEDDING_TIMEOUT_MS=30000',
      '  D2_EMBED_SINGLE_RUNS=20',
      '  D2_EMBED_DOCUMENT_CHUNKS=50',
    ].join('\n'),
  );
  process.exit(0);
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? 0;
}

function legalChunk(seed: number): string {
  return [
    `계약 해지와 손해배상 검토 ${seed}`,
    '비밀유지 의무, 진술 및 보장, 선행조건, 면책조항, 준거법 조항을 함께 검토한다.',
    '문서 검색 품질 측정을 위해 약 1000자 청크에 가까운 한국어 법률 문장을 반복한다.',
  ]
    .join(' ')
    .repeat(8)
    .slice(0, 1000);
}

async function timedEmbed(text: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL('/api/embed', endpoint).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: text,
        truncate: true,
        dimensions: 1024,
      }),
    });
    const elapsedMs = performance.now() - startedAt;
    if (!response.ok) throw new Error(`embedding http ${response.status}`);
    const body = (await response.json()) as { embeddings?: unknown };
    const embedding = Array.isArray(body.embeddings) ? body.embeddings[0] : null;
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      throw new Error(`unexpected embedding dimensions: ${Array.isArray(embedding) ? embedding.length : 0}`);
    }
    return elapsedMs;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const singleLatencies: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    singleLatencies.push(await timedEmbed(legalChunk(index)));
  }

  const documentStartedAt = performance.now();
  for (let index = 0; index < chunkCount; index += 1) {
    await timedEmbed(legalChunk(index + runs));
  }
  const documentElapsedMs = performance.now() - documentStartedAt;

  console.log(
    JSON.stringify(
      {
        endpoint,
        model,
        dimensions: 1024,
        singleRuns: runs,
        singleP95Ms: Math.round(percentile(singleLatencies, 0.95)),
        documentChunkCount: chunkCount,
        documentElapsedMs: Math.round(documentElapsedMs),
        pass: percentile(singleLatencies, 0.95) < 500 && documentElapsedMs < 30_000,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
