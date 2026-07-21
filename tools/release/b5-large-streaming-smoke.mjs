#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createWriteStream, openAsBlob, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const dryRun = args.has('--dry-run');
const localMode = args.has('--local');

const mib = 1024 * 1024;
const config = {
  apiBaseUrl: normalizeBase(
    env('B5_SMOKE_API_BASE_URL', localMode ? 'http://localhost:3001/v1' : undefined),
  ),
  tenantId: env(
    'B5_SMOKE_TENANT_ID',
    localMode ? '11111111-1111-4111-8111-111111111111' : undefined,
  ),
  email: env('B5_SMOKE_EMAIL', localMode ? 'alpha-matter-owner@test.local' : undefined),
  password: env('B5_SMOKE_PASSWORD', localMode ? 'dev-alpha-owner-password' : undefined),
  matterId: env('B5_SMOKE_MATTER_ID', undefined),
  sizeMiB: positiveInt(env('B5_SMOKE_SIZE_MIB', '400'), 400),
  apiPid: env('B5_SMOKE_API_PID', undefined),
  databaseUrl: env(
    'B5_SMOKE_DATABASE_URL',
    env('DATABASE_URL', 'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault'),
  ),
  maxRssDeltaMiB: positiveInt(env('B5_SMOKE_MAX_RSS_DELTA_MIB', '150'), 150),
  pollAttempts: positiveInt(env('B5_SMOKE_POLL_ATTEMPTS', '20'), 20),
  pollDelayMs: positiveInt(env('B5_SMOKE_POLL_DELAY_MS', '1500'), 1500),
};

const planned = [
  'refresh local Matter-source projection freshness when --local is set',
  'login',
  'resolve or create matter',
  'create synthetic large PDF on disk',
  'capture API RSS baseline immediately before upload',
  'upload via multipart file path',
  'open preview Range bytes=0-1023',
  'poll document detail for extraction ready state',
  'compare RSS delta against threshold when B5_SMOKE_API_PID is provided',
];

if (dryRun) {
  print({
    status: 'dry-run',
    planned,
    defaults: {
      sizeMiB: config.sizeMiB,
      maxRssDeltaMiB: config.maxRssDeltaMiB,
      apiPidRequiredForCompletionEvidence: true,
    },
  });
  process.exit(0);
}

assert(config.apiBaseUrl, 'B5_SMOKE_API_BASE_URL is required');
assert(config.tenantId, 'B5_SMOKE_TENANT_ID is required');
assert(config.email, 'B5_SMOKE_EMAIL is required');
assert(config.password, 'B5_SMOKE_PASSWORD is required');

let tempPath;
const startedAt = new Date().toISOString();
try {
  if (localMode) await ensureLocalMatterProjectionFresh();
  const cookie = await login();
  const matterId = config.matterId ?? (await createSyntheticMatter(cookie));
  tempPath = await createSyntheticPdf(config.sizeMiB);
  const rssBefore = readRssMiB(config.apiPid);
  const uploadStartedAt = Date.now();
  const documentId = await uploadDocument(cookie, matterId, tempPath);
  const uploadMs = Date.now() - uploadStartedAt;
  const preview = await openPreviewRange(cookie, documentId);
  const extraction = await waitForExtraction(cookie, documentId);
  const rssAfter = readRssMiB(config.apiPid);
  const rssDeltaMiB =
    rssBefore === null || rssAfter === null ? null : Number((rssAfter - rssBefore).toFixed(1));
  const pass =
    preview.status === 206 &&
    preview.bytes === 1024 &&
    extraction.terminal === true &&
    extraction.success === true &&
    (rssDeltaMiB === null || rssDeltaMiB < config.maxRssDeltaMiB);
  print({
    status: pass ? 'pass' : 'fail',
    startedAt,
    finishedAt: new Date().toISOString(),
    sizeMiB: config.sizeMiB,
    documentId,
    matterId,
    uploadMs,
    preview,
    extraction,
    rss: {
      pid: config.apiPid ?? null,
      beforeMiB: rssBefore,
      afterMiB: rssAfter,
      deltaMiB: rssDeltaMiB,
      maxDeltaMiB: config.maxRssDeltaMiB,
      apiPidRequiredForCompletionEvidence: !config.apiPid,
    },
  });
  process.exit(pass ? 0 : 1);
} finally {
  if (tempPath) rmSync(tempPath, { force: true });
}

async function ensureLocalMatterProjectionFresh() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query(
      `
        INSERT INTO matter_app_sync_state (
          tenant_id,
          source_ref,
          last_sync_at,
          reflected_count,
          drift_count,
          source_revision_hash,
          source_artifact_hash,
          run_id_hash,
          status,
          summary_json
        )
        VALUES (
          $1,
          'lawos_lazycodex_canonical_identity',
          now(),
          1,
          0,
          repeat('a', 64),
          repeat('b', 64),
          repeat('c', 64),
          'pass',
          '{"fixture":"b5_large_streaming_smoke"}'::jsonb
        )
        ON CONFLICT (tenant_id, source_ref)
        DO UPDATE SET
          last_sync_at = EXCLUDED.last_sync_at,
          reflected_count = EXCLUDED.reflected_count,
          drift_count = EXCLUDED.drift_count,
          source_revision_hash = EXCLUDED.source_revision_hash,
          source_artifact_hash = EXCLUDED.source_artifact_hash,
          run_id_hash = EXCLUDED.run_id_hash,
          status = EXCLUDED.status,
          summary_json = EXCLUDED.summary_json,
          updated_at = now()
      `,
      [config.tenantId],
    );
  } finally {
    await pool.end();
  }
}

async function login() {
  const response = await postJson('/auth/login', {
    tenantId: config.tenantId,
    email: config.email,
    password: config.password,
  });
  assert(response.status === 201 || response.status === 200, `login status ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert(cookie, 'login response missing session cookie');
  return cookie;
}

async function createSyntheticMatter(cookie) {
  const marker = `B5-SMOKE-${Date.now()}`;
  const client = await postJson(
    '/clients',
    {
      name: `${marker} Client`,
      clientType: 'corporation',
      confidentialityLevel: 'standard',
      status: 'active',
      metadata: { source: 'b5_large_streaming_smoke' },
    },
    cookie,
  );
  assert(client.status === 201 || client.status === 200, `client create status ${client.status}`);
  const clientBody = await client.json();
  assert(clientBody?.clientId, 'client create response missing clientId');
  const matter = await postJson(
    '/matters',
    {
      clientId: clientBody.clientId,
      matterCode: marker,
      matterName: 'B5 large streaming smoke matter',
      matterType: 'other',
      practiceGroup: 'SMOKE',
      metadata: { source: 'b5_large_streaming_smoke' },
    },
    cookie,
  );
  assert(matter.status === 201 || matter.status === 200, `matter create status ${matter.status}`);
  const matterBody = await matter.json();
  assert(matterBody?.matterId, 'matter create response missing matterId');
  return matterBody.matterId;
}

async function createSyntheticPdf(sizeMiB) {
  const path = join(tmpdir(), `amic-b5-large-${randomUUID()}.pdf`);
  const stream = createWriteStream(path, { flags: 'wx' });
  let offset = 0;
  const offsets = [];
  const contentStream = 'BT /F1 12 Tf 72 720 Td (B5 large streaming smoke ready text) Tj ET\n';

  async function writePart(part) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    if (!stream.write(chunk)) {
      await new Promise((resolve) => stream.once('drain', resolve));
    }
    offset += chunk.length;
  }

  async function writeObject(body) {
    offsets.push(offset);
    await writePart(`${offsets.length} 0 obj\n${body}\nendobj\n`);
  }

  await writePart('%PDF-1.7\n% AMIC B5 large streaming smoke\n');
  await writeObject('<< /Type /Catalog /Pages 2 0 R >>');
  await writeObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  await writeObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  );
  await writeObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  await writeObject(
    `<< /Length ${Buffer.byteLength(contentStream)} >>\nstream\n${contentStream}endstream`,
  );

  const largeStreamLength = sizeMiB * mib;
  offsets.push(offset);
  await writePart(`6 0 obj\n<< /Length ${largeStreamLength} >>\nstream\n`);
  const filler = Buffer.alloc(mib, 0x20);
  for (let index = 0; index < sizeMiB; index += 1) {
    await writePart(filler);
  }
  await writePart('\nendstream\nendobj\n');

  const xrefOffset = offset;
  const xrefRows = offsets
    .map((objectOffset) => `${String(objectOffset).padStart(10, '0')} 00000 n \n`)
    .join('');
  await writePart(
    `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${xrefRows}` +
      `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  stream.end();
  await new Promise((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });
  return path;
}

async function uploadDocument(cookie, matterId, filePath) {
  const form = new FormData();
  form.append('title', `B5 Large Streaming ${new Date().toISOString()}`);
  form.append('documentType', 'other');
  form.append('file', await openAsBlob(filePath, { type: 'application/pdf' }), 'b5-large.pdf');
  const response = await fetch(apiUrl(`/matters/${matterId}/documents`), {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  const text = await response.text();
  assert(
    response.status === 201 || response.status === 200,
    `upload status ${response.status}: ${text}`,
  );
  const body = JSON.parse(text);
  assert(body?.documentId, 'upload response missing documentId');
  return body.documentId;
}

async function openPreviewRange(cookie, documentId) {
  const response = await fetch(apiUrl(`/documents/${documentId}/preview`), {
    headers: { cookie, range: 'bytes=0-1023' },
  });
  const bytes = new Uint8Array(await response.arrayBuffer()).byteLength;
  return {
    status: response.status,
    bytes,
    contentLength: response.headers.get('content-length'),
    contentRange: response.headers.get('content-range'),
  };
}

async function waitForExtraction(cookie, documentId) {
  for (let attempt = 1; attempt <= config.pollAttempts; attempt += 1) {
    const response = await fetch(apiUrl(`/documents/${documentId}`), { headers: { cookie } });
    if (response.status === 200) {
      const body = await response.json();
      const status = body?.extractionStatus ?? body?.extraction?.status ?? body?.canonical?.status;
      if (status && status !== 'pending') {
        return { terminal: true, success: status === 'ready', status, attempt };
      }
    }
    await delay(config.pollDelayMs);
  }
  return { terminal: false, success: false, status: 'unknown', attempt: config.pollAttempts };
}

function readRssMiB(pid) {
  if (!pid) return null;
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim();
    const kib = Number(out);
    return Number.isFinite(kib) ? Number((kib / 1024).toFixed(1)) : null;
  } catch {
    return null;
  }
}

async function postJson(path, body, cookie) {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function apiUrl(path) {
  return `${config.apiBaseUrl}${path}`;
}

function normalizeBase(value) {
  return value?.replace(/\/+$/, '');
}

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function print(payload) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${payload.status}: B5 large streaming smoke\n`);
  }
}
