import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';

export type SearchLoadBenchMode = 'keyword' | 'hybrid';
export type SearchLoadBenchStatus = 'disabled' | 'completed' | 'failed';
export type BenchEndpointClass = 'loopback' | 'private_network' | 'blocked';

export interface SearchLoadBenchTransportResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null } | undefined;
  json?: (() => Promise<unknown>) | undefined;
  text?: (() => Promise<string>) | undefined;
}

export interface SearchLoadBenchTransport {
  fetch(
    url: string,
    init: {
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<SearchLoadBenchTransportResponse>;
}

export interface SyntheticSeedInput {
  enabled: boolean;
  databaseUrl: string;
  documentCount: number;
  batchSize?: number | undefined;
  tenantId: string;
  ownerUserId: string;
  query: string;
  seedKey?: string | undefined;
}

export interface RunSearchLoadBenchInput {
  enabled: boolean;
  apiBaseUrl: string;
  tenantId: string;
  email: string;
  password: string;
  query: string;
  modes: readonly SearchLoadBenchMode[];
  samples: number;
  concurrency: number;
  pageSize: number;
  target?: 'all' | 'title' | 'body' | undefined;
  timeoutMs?: number | undefined;
  outputDir?: string | undefined;
  seed?: SyntheticSeedInput | undefined;
  recordScale: boolean;
  transport?: SearchLoadBenchTransport | undefined;
  now?: Date | undefined;
  clock?: (() => number) | undefined;
}

export interface SyntheticDocumentSeed {
  index: number;
  documentId: string;
  versionId: string;
  fileObjectId: string;
  familyId: string;
  parentChunkId: string;
  childChunkId: string;
  title: string;
  contentText: string;
  contentHash: string;
  embeddingLiteral: string;
  embeddingHash: string;
  updatedAt: string;
}

export interface SearchLoadBenchRun {
  mode: SearchLoadBenchMode;
  status: 'completed' | 'failed';
  sampleCount: number;
  concurrency: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  targetP95Ms: number;
  measurementHash: string;
  evidenceRef: string;
  scalePerformanceRunId: string | null;
  failureCount: number;
  totalObserved: number | null;
}

export interface SearchLoadBenchReport {
  generatedAt: string;
  status: SearchLoadBenchStatus;
  endpointClass: BenchEndpointClass;
  outputPath: string | null;
  queryHash: string;
  tenantHash: string;
  seed: {
    enabled: boolean;
    documentCount: number;
    batchSize: number | null;
  };
  runs: SearchLoadBenchRun[];
  warnings: string[];
}

interface TimedSample {
  latencyMs: number;
  ok: boolean;
  total: number | null;
  reasonCode: string | null;
}

const defaultOutputDir = path.resolve('tools/bench/output');
const defaultKeywordTargetP95Ms = 3_000;
const defaultHybridTargetP95Ms = 5_000;
const defaultTimeoutMs = 30_000;
const defaultSyntheticSeedKey = 'd9-search-load';
const embeddingDimension = 1024;
const tokenPattern = /[\p{L}\p{N}_]+/gu;

export async function runSearchLoadBench(
  input: RunSearchLoadBenchInput,
): Promise<SearchLoadBenchReport> {
  validatePositiveInt(input.samples, 'samples');
  validatePositiveInt(input.concurrency, 'concurrency');
  validatePositiveInt(input.pageSize, 'pageSize');

  const generatedAt = (input.now ?? new Date()).toISOString();
  const endpointClass = classifyBenchEndpoint(input.apiBaseUrl);
  const warnings: string[] = [];
  const reportBase = {
    generatedAt,
    endpointClass,
    outputPath: null,
    queryHash: sha256(input.query),
    tenantHash: sha256(input.tenantId),
    seed: {
      enabled: input.seed?.enabled === true,
      documentCount: input.seed?.documentCount ?? 0,
      batchSize: input.seed?.batchSize ?? null,
    },
    runs: [],
    warnings,
  };

  if (!input.enabled) {
    return {
      ...reportBase,
      status: 'disabled',
      warnings: ['D9_SEARCH_BENCH_ENABLED is not true; no API, DB, or scale writes were made.'],
    };
  }
  if (endpointClass === 'blocked') {
    throw new Error('search load bench API endpoint must be loopback or private network');
  }

  if (input.seed?.enabled) {
    await seedSyntheticDocuments(input.seed);
    if (input.seed.documentCount < 200_000) {
      warnings.push(
        `Synthetic seed inserted ${input.seed.documentCount} documents; D9 full benchmark target is 200000.`,
      );
    }
  }
  if (input.samples < 20) {
    warnings.push(`Sample count ${input.samples} is smoke-only; D9 p95 evidence should use >=20 samples.`);
  }
  if (input.concurrency < 9) {
    warnings.push(`Concurrency ${input.concurrency} is smoke-only; D9 full benchmark target is 9.`);
  }

  const transport = input.transport ?? defaultTransport();
  const cookie = await login(input, transport);
  const runs: SearchLoadBenchRun[] = [];
  for (const mode of uniqueModes(input.modes)) {
    const run = await measureMode({
      input,
      mode,
      cookie,
      transport,
      generatedAt,
      clock: input.clock ?? (() => performance.now()),
    });
    if (input.recordScale && run.status === 'completed' && run.failureCount === 0) {
      run.scalePerformanceRunId = await recordScaleRun(input, transport, cookie, run);
    }
    runs.push(run);
  }

  const status: SearchLoadBenchStatus = runs.some((run) => run.status === 'failed')
    ? 'failed'
    : 'completed';
  const report: SearchLoadBenchReport = {
    ...reportBase,
    status,
    runs,
    warnings,
  };
  const outputDir = ensureBenchOutputDir(input.outputDir ?? defaultOutputDir);
  const outputPath = path.join(outputDir, `search-load-bench-${safeTimestamp(generatedAt)}.json`);
  report.outputPath = outputPath;
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function classifyBenchEndpoint(endpoint: string): BenchEndpointClass {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'blocked';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'blocked';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return 'loopback';
  }
  if (
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.svc') ||
    isPrivateIpv4(host)
  ) {
    return 'private_network';
  }
  return 'blocked';
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(quantile * sorted.length) - 1;
  return Math.round(sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]);
}

export function syntheticDocumentSeed(input: {
  index: number;
  query: string;
  seedKey?: string | undefined;
}): SyntheticDocumentSeed {
  const seedKey = input.seedKey ?? defaultSyntheticSeedKey;
  const contentText = syntheticSearchText(input.query, input.index);
  const vector = deterministicEmbeddingVector(contentText);
  return {
    index: input.index,
    documentId: uuidFromSeed(`${seedKey}:document:${input.index}`),
    versionId: uuidFromSeed(`${seedKey}:version:${input.index}`),
    fileObjectId: uuidFromSeed(`${seedKey}:file-object:${input.index}`),
    familyId: uuidFromSeed(`${seedKey}:family:${input.index}`),
    parentChunkId: uuidFromSeed(`${seedKey}:parent-chunk:${input.index}`),
    childChunkId: uuidFromSeed(`${seedKey}:child-chunk:${input.index}`),
    title: `D9 synthetic search document ${input.index}`,
    contentText,
    contentHash: sha256(contentText),
    embeddingLiteral: vectorToSqlLiteral(vector),
    embeddingHash: embeddingHash(vector),
    updatedAt: '2026-07-05T00:00:00.000Z',
  };
}

export function uuidFromSeed(seed: string): string {
  const chars = sha256(seed).slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}

export async function seedSyntheticDocuments(input: SyntheticSeedInput): Promise<void> {
  validatePositiveInt(input.documentCount, 'seed.documentCount');
  const batchSize = input.batchSize ?? 1_000;
  validatePositiveInt(batchSize, 'seed.batchSize');
  await withOwnerClient(input.databaseUrl, async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, input.tenantId);
      await seedSyntheticMatter(client, input);
      for (let start = 1; start <= input.documentCount; start += batchSize) {
        const rows = Array.from(
          { length: Math.min(batchSize, input.documentCount - start + 1) },
          (_, offset) =>
            syntheticDocumentSeed({
              index: start + offset,
              query: input.query,
              seedKey: input.seedKey,
            }),
        );
        await insertSyntheticBatch(client, input, rows);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

function syntheticSearchText(query: string, index: number): string {
  return [
    query,
    'synthetic D9 scale fixture',
    `document ${index}`,
    'termination indemnity governing law confidentiality privilege review clause',
    'This text is synthetic and contains no customer document content.',
  ].join(' ');
}

async function measureMode(input: {
  input: RunSearchLoadBenchInput;
  mode: SearchLoadBenchMode;
  cookie: string;
  transport: SearchLoadBenchTransport;
  generatedAt: string;
  clock: () => number;
}): Promise<SearchLoadBenchRun> {
  const samples = await runConcurrentSamples(
    input.input.samples,
    input.input.concurrency,
    async () => searchOnce(input),
  );
  const latencies = samples.map((sample) => sample.latencyMs);
  const failureCount = samples.filter((sample) => !sample.ok).length;
  const p50Ms = percentile(latencies, 0.5);
  const p95Ms = percentile(latencies, 0.95);
  const p99Ms = percentile(latencies, 0.99);
  const targetP95Ms = input.mode === 'keyword' ? defaultKeywordTargetP95Ms : defaultHybridTargetP95Ms;
  const measurementHash = sha256(
    JSON.stringify({
      generatedAt: input.generatedAt,
      mode: input.mode,
      queryHash: sha256(input.input.query),
      samples: input.input.samples,
      concurrency: input.input.concurrency,
      p50Ms,
      p95Ms,
      p99Ms,
      failureCount,
    }),
  );
  return {
    mode: input.mode,
    status: failureCount === 0 ? 'completed' : 'failed',
    sampleCount: samples.length,
    concurrency: input.input.concurrency,
    p50Ms,
    p95Ms,
    p99Ms,
    targetP95Ms,
    measurementHash,
    evidenceRef: evidenceRef(input.generatedAt, input.mode),
    scalePerformanceRunId: null,
    failureCount,
    totalObserved: samples.find((sample) => sample.total !== null)?.total ?? null,
  };
}

async function searchOnce(input: {
  input: RunSearchLoadBenchInput;
  mode: SearchLoadBenchMode;
  cookie: string;
  transport: SearchLoadBenchTransport;
  clock: () => number;
}): Promise<TimedSample> {
  const started = input.clock();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.input.timeoutMs ?? defaultTimeoutMs);
  try {
    const response = await input.transport.fetch(apiUrl(input.input.apiBaseUrl, '/search'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: input.cookie,
      },
      signal: controller.signal,
      body: JSON.stringify({
        query: input.input.query,
        mode: input.mode,
        target: input.input.target ?? 'all',
        page: 1,
        pageSize: input.input.pageSize,
      }),
    });
    const latencyMs = Math.max(0, Math.round(input.clock() - started));
    if (!response.ok) {
      return { latencyMs, ok: false, total: null, reasonCode: `search_http_${response.status}` };
    }
    const body = asSearchResponse(await safeJson(response));
    return { latencyMs, ok: true, total: body.total, reasonCode: null };
  } catch {
    return {
      latencyMs: Math.max(0, Math.round(input.clock() - started)),
      ok: false,
      total: null,
      reasonCode: 'search_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function login(
  input: RunSearchLoadBenchInput,
  transport: SearchLoadBenchTransport,
): Promise<string> {
  const response = await transport.fetch(apiUrl(input.apiBaseUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      email: input.email,
      password: input.password,
    }),
  });
  if (!response.ok) throw new Error(`search load bench login failed: ${response.status}`);
  const cookie = extractSessionCookie(response.headers?.get('set-cookie') ?? '');
  if (!cookie) throw new Error('search load bench login did not return a session cookie');
  return cookie;
}

async function recordScaleRun(
  input: RunSearchLoadBenchInput,
  transport: SearchLoadBenchTransport,
  cookie: string,
  run: SearchLoadBenchRun,
): Promise<string> {
  const response = await transport.fetch(apiUrl(input.apiBaseUrl, '/scale/performance-runs'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      scenario: 'search_query',
      sampleCount: run.sampleCount,
      p50Ms: run.p50Ms,
      p95Ms: run.p95Ms,
      p99Ms: run.p99Ms,
      targetP95Ms: run.targetP95Ms,
      measurementHash: run.measurementHash,
      evidenceRef: run.evidenceRef,
    }),
  });
  if (!response.ok) throw new Error(`scale performance run insert failed: ${response.status}`);
  const body = await safeJson(response);
  if (!isObject(body) || typeof body.performanceRunId !== 'string') {
    throw new Error('scale performance run insert returned no performanceRunId');
  }
  return body.performanceRunId;
}

async function runConcurrentSamples<T>(
  sampleCount: number,
  concurrency: number,
  run: () => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, sampleCount);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= sampleCount) return;
        results[current] = await run();
      }
    }),
  );
  return results;
}

function apiUrl(baseUrl: string, apiPath: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, '');
  const root = trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  return `${root}${apiPath}`;
}

function extractSessionCookie(setCookie: string): string | null {
  const match = setCookie.match(/(?:^|,\s*)amic_session=([^;]+)/u);
  return match ? `amic_session=${match[1]}` : null;
}

function asSearchResponse(value: unknown): { total: number | null } {
  if (!isObject(value)) return { total: null };
  return typeof value.total === 'number' && Number.isFinite(value.total)
    ? { total: value.total }
    : { total: null };
}

async function safeJson(response: SearchLoadBenchTransportResponse): Promise<unknown> {
  if (response.json) return response.json();
  if (response.text) return JSON.parse(await response.text());
  return {};
}

async function withOwnerClient<T>(
  databaseUrl: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function setTenant(client: Client, tenantId: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant_id', tenantId]);
}

async function seedSyntheticMatter(client: Client, input: SyntheticSeedInput): Promise<void> {
  const clientId = seedClientId(input);
  const matterId = seedMatterId(input);
  await client.query(
    `
      INSERT INTO clients (client_id, tenant_id, name, created_by)
      VALUES ($1, $2, 'D9 Synthetic Search Client', $3)
      ON CONFLICT (client_id) DO UPDATE SET name = EXCLUDED.name
    `,
    [clientId, input.tenantId, input.ownerUserId],
  );
  await client.query(
    `
      INSERT INTO matters (
        matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
        status, lead_lawyer_id, created_by, access_scope
      )
      VALUES ($1, $2, $3, 'D9-BENCH', 'D9 Synthetic Search Matter', 'contract',
        'active', $4, $4, 'restricted')
      ON CONFLICT (tenant_id, matter_id)
      DO UPDATE SET access_scope = EXCLUDED.access_scope,
        lead_lawyer_id = EXCLUDED.lead_lawyer_id
    `,
    [matterId, input.tenantId, clientId, input.ownerUserId],
  );
  await client.query(
    `
      INSERT INTO matter_members (
        tenant_id, matter_id, user_id, matter_role, access_level, added_by
      )
      VALUES ($1, $2, $3, 'owner', 'edit', $3)
      ON CONFLICT (matter_id, user_id)
      DO UPDATE SET matter_role = EXCLUDED.matter_role,
        access_level = EXCLUDED.access_level
    `,
    [input.tenantId, matterId, input.ownerUserId],
  );
}

async function insertSyntheticBatch(
  client: Client,
  input: SyntheticSeedInput,
  rows: readonly SyntheticDocumentSeed[],
): Promise<void> {
  const clientId = seedClientId(input);
  const matterId = seedMatterId(input);
  const documentIds = rows.map((row) => row.documentId);
  const versionIds = rows.map((row) => row.versionId);
  const fileObjectIds = rows.map((row) => row.fileObjectId);
  const familyIds = rows.map((row) => row.familyId);
  const parentChunkIds = rows.map((row) => row.parentChunkId);
  const childChunkIds = rows.map((row) => row.childChunkId);
  const titles = rows.map((row) => row.title);
  const contentTexts = rows.map((row) => row.contentText);
  const hashes = rows.map((row) => row.contentHash);
  const embeddings = rows.map((row) => row.embeddingLiteral);
  const embeddingHashes = rows.map((row) => row.embeddingHash);
  const updatedAts = rows.map((row) => row.updatedAt);
  const storageUris = rows.map(
    (row) =>
      `s3://amic-vault-dev/tenants/${input.tenantId}/matters/${matterId}/documents/${row.documentId}/${row.fileObjectId}`,
  );

  await client.query(
    `
      INSERT INTO file_objects (
        file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
        mime_type, size_bytes, sha256, created_by
      )
      SELECT row.file_object_id, $1::uuid, row.storage_uri, row.filename, row.filename,
        'application/pdf', 32, row.sha256, $2::uuid
      FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
        AS row(file_object_id, storage_uri, filename, sha256)
      ON CONFLICT (file_object_id) DO NOTHING
    `,
    [
      input.tenantId,
      input.ownerUserId,
      fileObjectIds,
      storageUris,
      titles.map((title) => `${title}.pdf`),
      hashes,
    ],
  );
  await client.query(
    `
      INSERT INTO documents (
        document_id, tenant_id, matter_id, document_family_id, title, status,
        document_type, confidentiality_level, privilege_status, ai_allowed,
        created_by, created_at, updated_at
      )
      SELECT row.document_id, $1::uuid, $2::uuid, row.family_id, row.title, 'draft',
        'memo', 'standard', 'none', false, $3::uuid, row.updated_at, row.updated_at
      FROM unnest($4::uuid[], $5::uuid[], $6::text[], $7::timestamptz[])
        AS row(document_id, family_id, title, updated_at)
      ON CONFLICT (tenant_id, document_id)
      DO UPDATE SET title = EXCLUDED.title,
        status = EXCLUDED.status,
        document_type = EXCLUDED.document_type,
        confidentiality_level = EXCLUDED.confidentiality_level,
        privilege_status = EXCLUDED.privilege_status,
        updated_at = EXCLUDED.updated_at
    `,
    [input.tenantId, matterId, input.ownerUserId, documentIds, familyIds, titles, updatedAts],
  );
  await client.query(
    `
      INSERT INTO document_versions (
        version_id, tenant_id, document_id, version_no, version_status,
        file_object_id, file_hash, created_by
      )
      SELECT row.version_id, $1::uuid, row.document_id, 1, 'current',
        row.file_object_id, row.file_hash, $2::uuid
      FROM unnest($3::uuid[], $4::uuid[], $5::uuid[], $6::text[])
        AS row(version_id, document_id, file_object_id, file_hash)
      ON CONFLICT (tenant_id, version_id)
      DO UPDATE SET version_status = EXCLUDED.version_status,
        file_object_id = EXCLUDED.file_object_id,
        file_hash = EXCLUDED.file_hash
    `,
    [input.tenantId, input.ownerUserId, versionIds, documentIds, fileObjectIds, hashes],
  );
  await client.query(
    `
      INSERT INTO document_search_index (
        tenant_id, document_id, version_id, matter_id, client_id, document_type,
        document_status, version_status, author_user_id, ai_allowed, prev_version_id,
        next_version_id, title, content_text, content_truncated, source_text_hash,
        indexed_at, updated_at
      )
      SELECT $1::uuid, row.document_id, row.version_id, $2::uuid, $3::uuid, 'memo',
        'draft', 'current', $4::uuid, false, NULL::uuid, NULL::uuid, row.title,
        row.content_text, false, row.source_text_hash, now(), row.updated_at
      FROM unnest($5::uuid[], $6::uuid[], $7::text[], $8::text[], $9::text[], $10::timestamptz[])
        AS row(document_id, version_id, title, content_text, source_text_hash, updated_at)
      ON CONFLICT (tenant_id, version_id)
      DO UPDATE SET title = EXCLUDED.title,
        content_text = EXCLUDED.content_text,
        content_truncated = false,
        source_text_hash = EXCLUDED.source_text_hash,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.tenantId,
      matterId,
      clientId,
      input.ownerUserId,
      documentIds,
      versionIds,
      titles,
      contentTexts,
      hashes,
      updatedAts,
    ],
  );
  await insertChunkBatch(client, input, {
    documentIds,
    versionIds,
    parentChunkIds,
    childChunkIds,
    contentTexts,
    hashes,
    embeddings,
    embeddingHashes,
  });
}

async function insertChunkBatch(
  client: Client,
  input: SyntheticSeedInput,
  batch: {
    documentIds: readonly string[];
    versionIds: readonly string[];
    parentChunkIds: readonly string[];
    childChunkIds: readonly string[];
    contentTexts: readonly string[];
    hashes: readonly string[];
    embeddings: readonly string[];
    embeddingHashes: readonly string[];
  },
): Promise<void> {
  const charEnds = batch.contentTexts.map((text) => text.length);
  await client.query(
    `
      INSERT INTO document_chunks (
        chunk_id, tenant_id, document_id, version_id, parent_chunk_id, chunk_kind,
        chunk_ordinal, char_start, char_end, token_count, chunk_text, text_hash,
        source_text_hash, stale, updated_at
      )
      SELECT row.chunk_id, $1::uuid, row.document_id, row.version_id, NULL::uuid,
        'parent', 0, 0, row.char_end, 32, row.chunk_text, row.text_hash,
        row.text_hash, false, now()
      FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::integer[], $6::text[], $7::text[])
        AS row(chunk_id, document_id, version_id, char_end, chunk_text, text_hash)
      ON CONFLICT (tenant_id, version_id, chunk_ordinal)
      DO UPDATE SET chunk_text = EXCLUDED.chunk_text,
        text_hash = EXCLUDED.text_hash,
        source_text_hash = EXCLUDED.source_text_hash,
        stale = false,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.tenantId,
      batch.parentChunkIds,
      batch.documentIds,
      batch.versionIds,
      charEnds,
      batch.contentTexts,
      batch.hashes,
    ],
  );
  await client.query(
    `
      INSERT INTO document_chunks (
        chunk_id, tenant_id, document_id, version_id, parent_chunk_id, chunk_kind,
        chunk_ordinal, char_start, char_end, token_count, chunk_text, text_hash,
        source_text_hash, stale, updated_at
      )
      SELECT row.chunk_id, $1::uuid, row.document_id, row.version_id, row.parent_chunk_id,
        'child', 1, 0, row.char_end, 32, row.chunk_text, row.text_hash,
        row.text_hash, false, now()
      FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::integer[], $7::text[], $8::text[])
        AS row(chunk_id, document_id, version_id, parent_chunk_id, char_end, chunk_text, text_hash)
      ON CONFLICT (tenant_id, version_id, chunk_ordinal)
      DO UPDATE SET parent_chunk_id = EXCLUDED.parent_chunk_id,
        chunk_text = EXCLUDED.chunk_text,
        text_hash = EXCLUDED.text_hash,
        source_text_hash = EXCLUDED.source_text_hash,
        stale = false,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.tenantId,
      batch.childChunkIds,
      batch.documentIds,
      batch.versionIds,
      batch.parentChunkIds,
      charEnds,
      batch.contentTexts,
      batch.hashes,
    ],
  );
  await client.query(
    `
      INSERT INTO document_chunk_embeddings (
        tenant_id, chunk_id, document_id, version_id, model_route, model_tier,
        embedding, embedding_hash, source_text_hash, stale, updated_at
      )
      SELECT $1::uuid, row.chunk_id, row.document_id, row.version_id, 'bge_m3', 'local',
        row.embedding::vector, row.embedding_hash, row.source_text_hash, false, now()
      FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::text[])
        AS row(chunk_id, document_id, version_id, embedding, embedding_hash, source_text_hash)
      ON CONFLICT (tenant_id, chunk_id, model_route)
      DO UPDATE SET document_id = EXCLUDED.document_id,
        version_id = EXCLUDED.version_id,
        embedding = EXCLUDED.embedding,
        embedding_hash = EXCLUDED.embedding_hash,
        source_text_hash = EXCLUDED.source_text_hash,
        stale = false,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.tenantId,
      batch.childChunkIds,
      batch.documentIds,
      batch.versionIds,
      batch.embeddings,
      batch.embeddingHashes,
      batch.hashes,
    ],
  );
}

function seedClientId(input: SyntheticSeedInput): string {
  return uuidFromSeed(`${input.seedKey ?? defaultSyntheticSeedKey}:client:${input.tenantId}`);
}

function seedMatterId(input: SyntheticSeedInput): string {
  return uuidFromSeed(`${input.seedKey ?? defaultSyntheticSeedKey}:matter:${input.tenantId}`);
}

function evidenceRef(generatedAt: string, mode: SearchLoadBenchMode): string {
  return `D9/search-load-${mode}-${safeTimestamp(generatedAt)}`.slice(0, 120);
}

function uniqueModes(modes: readonly SearchLoadBenchMode[]): SearchLoadBenchMode[] {
  const requested: readonly SearchLoadBenchMode[] = modes.length > 0 ? modes : ['keyword'];
  return Array.from(new Set(requested));
}

function ensureBenchOutputDir(outputDir: string): string {
  const resolved = path.resolve(outputDir);
  const allowedRoot = path.resolve('tools/bench/output');
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('search load bench output must stay under tools/bench/output');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function defaultTransport(): SearchLoadBenchTransport {
  return {
    async fetch(url, init) {
      const response = await fetch(url, init as RequestInit);
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        json: () => response.json() as Promise<unknown>,
        text: () => response.text(),
      };
    },
  };
}

function validatePositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/gu, '-');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deterministicEmbeddingVector(text: string): number[] {
  const vector = Array.from({ length: embeddingDimension }, () => 0);
  const tokens = text.toLowerCase().match(tokenPattern) ?? [];
  const source = tokens.length > 0 ? tokens : [text.slice(0, 256)];
  for (const token of source) {
    const digest = crypto.createHash('sha256').update(token).digest();
    const index = (((digest[0] ?? 0) << 8) + (digest[1] ?? 0)) % embeddingDimension;
    const sign = (digest[2] ?? 0) % 2 === 0 ? 1 : -1;
    const weight = ((digest[3] ?? 0) + 1) / 256;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function vectorToSqlLiteral(vector: readonly number[]): string {
  if (vector.length !== embeddingDimension) {
    throw new Error(`embedding vector must have ${embeddingDimension} dimensions`);
  }
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}

function embeddingHash(vector: readonly number[]): string {
  return sha256(vectorToSqlLiteral(vector));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
