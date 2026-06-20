#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const args = new Set(process.argv.slice(2));
const localMode = args.has('--local');
const dryRun = args.has('--dry-run');
const checkEnv = args.has('--check-env');
const jsonOutput = args.has('--json');
const verbose = args.has('--verbose');

const defaultTimeoutMs = Number(process.env.DMS_SMOKE_TIMEOUT_MS ?? process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const repoSha = safeGitSha();

const config = {
  apiBaseUrl: normalizeBase(
    value(
      'DMS_SMOKE_API_BASE_URL',
      value(
        'API_BASE_URL',
        localMode
          ? 'http://localhost:3001/v1'
          : dryRun
            ? 'https://api.example.invalid/v1'
            : undefined,
      ),
    ),
    'DMS_SMOKE_API_BASE_URL or API_BASE_URL',
    { collectOnly: checkEnv },
  ),
  releaseSha: value('RELEASE_SHA', repoSha),
  targetRef: value(
    'DMS_SMOKE_TARGET_REF',
    value('SMOKE_TARGET_REF', localMode ? 'local-dev' : 'approved-dms-smoke-ref'),
  ),
  requireAuth: value('DMS_SMOKE_REQUIRE_AUTH', value('SMOKE_REQUIRE_AUTH', '1')) === '1',
  tenantId: value(
    'DMS_SMOKE_TENANT_ID',
    value('SMOKE_TENANT_ID', localMode ? '11111111-1111-4111-8111-111111111111' : undefined),
  ),
  tenantSlug: value('DMS_SMOKE_TENANT_SLUG', value('SMOKE_TENANT_SLUG', undefined)),
  email: value(
    'DMS_SMOKE_EMAIL',
    value('SMOKE_EMAIL', localMode ? 'alpha-firm-admin@test.local' : undefined),
  ),
  password: value(
    'DMS_SMOKE_PASSWORD',
    value('SMOKE_PASSWORD', localMode ? 'dev-alpha-firm-admin-password' : undefined),
  ),
  negativeTenantId: value(
    'DMS_SMOKE_NEGATIVE_TENANT_ID',
    value(
      'SMOKE_NEGATIVE_TENANT_ID',
      localMode ? '22222222-2222-4222-8222-222222222222' : undefined,
    ),
  ),
  negativeTenantSlug: value('DMS_SMOKE_NEGATIVE_TENANT_SLUG', value('SMOKE_NEGATIVE_TENANT_SLUG', undefined)),
  negativeEmail: value(
    'DMS_SMOKE_NEGATIVE_EMAIL',
    value('SMOKE_NEGATIVE_EMAIL', localMode ? 'beta-member@test.local' : undefined),
  ),
  negativePassword: value(
    'DMS_SMOKE_NEGATIVE_PASSWORD',
    value('SMOKE_NEGATIVE_PASSWORD', localMode ? 'dev-beta-member-password' : undefined),
  ),
  createSynthetic: value('DMS_SMOKE_CREATE_SYNTHETIC', localMode ? '1' : '0') === '1',
  clientId: value('DMS_SMOKE_CLIENT_ID', undefined),
  matterId: value('DMS_SMOKE_MATTER_ID', undefined),
  filePath: value('DMS_SMOKE_FILE_PATH', undefined),
  allowIndexPending: value('DMS_SMOKE_ALLOW_INDEX_PENDING', '0') === '1',
  allowPreviewUnavailable: value('DMS_SMOKE_ALLOW_PREVIEW_UNAVAILABLE', '1') === '1',
  timeoutMs: Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs > 0 ? defaultTimeoutMs : 10_000,
  pollAttempts: positiveInt(value('DMS_SMOKE_POLL_ATTEMPTS', localMode ? '8' : '12'), 8),
  pollDelayMs: positiveInt(value('DMS_SMOKE_POLL_DELAY_MS', '1000'), 1000),
};

const plannedChecks = [
  ['DMS-SMOKE-001', 'Login with approved DMS smoke user'],
  ['DMS-SMOKE-002', 'Resolve Matter Code source before upload'],
  ['DMS-SMOKE-003', 'Upload file through matter-scoped endpoint'],
  ['DMS-SMOKE-004', 'Open document detail and safe profile fields'],
  ['DMS-SMOKE-005', 'Open preview or safe preview-unavailable state'],
  ['DMS-SMOKE-006', 'List document versions'],
  ['DMS-SMOKE-007', 'Confirm matter-scoped file list visibility'],
  ['DMS-SMOKE-008', 'Confirm title/body/metadata search visibility'],
  ['DMS-SMOKE-009', 'Read document and matter audit refs only'],
  ['DMS-SMOKE-010', 'Read records governance link for the matter'],
  ['DMS-SMOKE-011', 'Negative user cannot read uploaded document'],
  ['DMS-SMOKE-012', 'Negative user cannot discover uploaded document in search'],
];

if (dryRun) {
  printResult({
    status: 'dry-run',
    releaseSha: config.releaseSha,
    targetRef: config.targetRef,
    checks: plannedChecks.map(([id, name]) => ({ id, name, result: 'planned' })),
  });
  process.exit(0);
}

const envReadiness = evaluateEnvironmentReadiness();
if (checkEnv) {
  printResult(envReadiness);
  process.exit(envReadiness.status === 'pass' ? 0 : 1);
}

if (envReadiness.status !== 'pass') {
  throw new Error(formatEnvironmentReadinessError(envReadiness));
}

assert(hasPrimaryCredentials(), 'missing primary DMS smoke credentials');
if (!config.createSynthetic && !config.matterId) {
  throw new Error('DMS_SMOKE_MATTER_ID is required unless DMS_SMOKE_CREATE_SYNTHETIC=1');
}
if (config.createSynthetic && !isLocalOrExplicitSynthetic()) {
  throw new Error('DMS_SMOKE_CREATE_SYNTHETIC=1 requires --local or DMS_SMOKE_SYNTHETIC_APPROVED=1');
}

const results = [];
let sessionCookie;
let negativeCookie;
let matterId = config.matterId;
let matterCode = '';
let documentId;
let uploadTitle = `DMS Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const searchNeedle = searchNeedleFromTitle(uploadTitle);

await run('DMS-SMOKE-001', 'Login with approved DMS smoke user', async () => {
  const response = await postJson(apiUrl('/auth/login'), loginPayload(config));
  assert(response.status === 201 || response.status === 200, `login status ${response.status}`);
  const body = await response.json();
  assert(body?.user?.tenantId, 'login response missing tenant context');
  sessionCookie = extractSessionCookie(response.headers.get('set-cookie'));
  assert(sessionCookie, 'login response missing session cookie');
  return { status: response.status, tenantScoped: true, cookie: 'present' };
});

await run('DMS-SMOKE-002', 'Resolve Matter Code source before upload', async () => {
  assert(sessionCookie, 'missing session cookie');
  if (config.createSynthetic) {
    const clientId = config.clientId ?? (await createSyntheticClient());
    const matter = await createSyntheticMatter(clientId);
    matterId = matter.matterId;
    matterCode = matter.matterCode;
    return { source: 'synthetic-approved', matterResolved: true, matterCodePresent: Boolean(matterCode) };
  }

  const response = await fetchWithTimeout(apiUrl(`/matters/${matterId}`), {
    headers: { cookie: sessionCookie },
  });
  assert(response.status === 200, `matter get status ${response.status}`);
  const matter = await response.json();
  assert(matter?.matterId === matterId, 'approved matter was not returned');
  matterCode = String(matter.matterCode ?? '');
  assert(matterCode, 'approved matter is missing Matter Code');
  return { source: 'approved-matter-ref', matterResolved: true, matterCodePresent: true };
});

await run('DMS-SMOKE-003', 'Upload file through matter-scoped endpoint', async () => {
  assert(sessionCookie, 'missing session cookie');
  assert(matterId, 'missing matter id');
  const upload = await uploadSmokeDocument(matterId);
  documentId = upload.documentId;
  assert(documentId, 'upload response missing document ref');
  assert(upload.matterId === matterId, 'upload response was not matter-scoped');
  return {
    status: 'uploaded',
    matterScoped: true,
    documentRefPresent: true,
    duplicates: Array.isArray(upload.duplicates) ? upload.duplicates.length : 0,
    aiAllowed: upload.aiAllowed === true,
  };
});

await run('DMS-SMOKE-004', 'Open document detail and safe profile fields', async () => {
  const document = await getJsonWithCookie(`/documents/${documentId}`, sessionCookie);
  assert(document?.documentId === documentId, 'document detail missing uploaded document');
  assert(document?.matterId === matterId, 'document detail matter scope mismatch');
  assert(document?.title, 'document detail missing title');
  assertNoRawLeakage(document);
  return {
    status: 'readable',
    profilePresent: true,
    matterScoped: true,
    displayNamePresent: Boolean(document.displayName ?? document.safeLabel ?? document.title),
  };
});

await run('DMS-SMOKE-005', 'Open preview or safe preview-unavailable state', async () => {
  const response = await fetchWithTimeout(apiUrl(`/documents/${documentId}/preview`), {
    headers: { cookie: sessionCookie, range: 'bytes=0-16' },
  });
  if (response.status === 200 || response.status === 206) {
    return { status: response.status, preview: 'available', contentType: safeHeader(response.headers.get('content-type')) };
  }
  const body = await safeJson(response);
  const safeUnavailable =
    config.allowPreviewUnavailable &&
    [400, 404, 422].includes(response.status) &&
    isSafeDenialOrUnavailableCode(body?.code);
  assert(safeUnavailable, `preview status ${response.status}`);
  assertSafeDeniedBody(body);
  return { status: response.status, preview: 'safe-unavailable', denialCode: body?.code ?? 'safe' };
});

await run('DMS-SMOKE-006', 'List document versions', async () => {
  const body = await getJsonWithCookie(`/documents/${documentId}/versions?pageSize=5`, sessionCookie);
  const items = Array.isArray(body?.items) ? body.items : [];
  assert(items.length > 0, 'document versions missing current version');
  assertNoRawLeakage(items);
  return { status: 'listed', versionCount: items.length };
});

await run('DMS-SMOKE-007', 'Confirm matter-scoped file list visibility', async () => {
  const visible = await pollFor(async () => {
    const body = await getJsonWithCookie(
      `/matters/${matterId}/documents?title=${encodeURIComponent(uploadTitle)}&pageSize=20`,
      sessionCookie,
    );
    const items = Array.isArray(body?.items) ? body.items : [];
    return items.some((item) => item?.documentId === documentId);
  });
  assert(visible || config.allowIndexPending, 'uploaded document not visible in matter-scoped file list');
  return { visible, indexPendingAllowed: !visible && config.allowIndexPending };
});

await run('DMS-SMOKE-008', 'Confirm title/body/metadata search visibility', async () => {
  const visible = await pollFor(async () => {
    const response = await postJson(
      apiUrl('/search'),
      {
        query: searchNeedle,
        mode: 'keyword',
        target: 'all',
        filters: { matterId, title: searchNeedle },
        pageSize: 10,
      },
      sessionCookie,
    );
    assert(response.status === 200, `search status ${response.status}`);
    const body = await response.json();
    assertNoRawLeakage(body);
    return Array.isArray(body?.results) && body.results.some((item) => item?.documentId === documentId);
  });
  assert(visible || config.allowIndexPending, 'uploaded document not visible in permission-bound search');
  return { visible, target: 'title-body-metadata', indexPendingAllowed: !visible && config.allowIndexPending };
});

await run('DMS-SMOKE-009', 'Read document and matter audit refs only', async () => {
  const documentAudit = await getJsonWithCookie(
    `/documents/${documentId}/audit-events?pageSize=10`,
    sessionCookie,
  );
  const matterAudit = await getJsonWithCookie(
    `/matters/${matterId}/audit-events?pageSize=10`,
    sessionCookie,
  );
  assert(Array.isArray(documentAudit?.items), 'document audit response missing items');
  assert(Array.isArray(matterAudit?.items), 'matter audit response missing items');
  assertNoRawLeakage(documentAudit);
  assertNoRawLeakage(matterAudit);
  return {
    documentAuditRefs: documentAudit.items.length,
    matterAuditRefs: matterAudit.items.length,
    referenceOnly: true,
  };
});

await run('DMS-SMOKE-010', 'Read records governance link for the matter', async () => {
  const body = await getJsonWithCookie(`/records/legal-holds?matterId=${matterId}`, sessionCookie);
  assert(Array.isArray(body?.items), 'records legal hold response missing items');
  assertNoRawLeakage(body);
  return { status: 'linked', legalHoldRefs: body.items.length };
});

await run('DMS-SMOKE-011', 'Negative user cannot read uploaded document', async () => {
  if (!hasNegativeCredentials()) {
    if (config.requireAuth) throw new Error('missing negative DMS smoke credentials');
    return { skipped: true, reason: 'negative credentials not provided' };
  }
  negativeCookie ??= await loginNegativeUser();
  const denied = await fetchWithTimeout(apiUrl(`/documents/${documentId}`), {
    headers: { cookie: negativeCookie },
  });
  assert([401, 403, 404].includes(denied.status), `negative document read status ${denied.status}`);
  const body = await safeJson(denied);
  assertSafeDeniedBody(body);
  assertNoKnownRefsInBody(body);
  return { status: denied.status, denialCode: body?.code ?? 'safe-denied' };
});

await run('DMS-SMOKE-012', 'Negative user cannot discover uploaded document in search', async () => {
  if (!hasNegativeCredentials()) {
    if (config.requireAuth) throw new Error('missing negative DMS smoke credentials');
    return { skipped: true, reason: 'negative credentials not provided' };
  }
  negativeCookie ??= await loginNegativeUser();
  const response = await postJson(
    apiUrl('/search'),
    {
      query: searchNeedle,
      mode: 'keyword',
      target: 'all',
      filters: { title: searchNeedle },
      pageSize: 10,
    },
    negativeCookie,
  );
  if ([401, 403, 404].includes(response.status)) {
    const body = await safeJson(response);
    assertSafeDeniedBody(body);
    assertNoKnownRefsInBody(body);
    return { status: response.status, search: 'safe-denied' };
  }
  assert(response.status === 200, `negative search status ${response.status}`);
  const body = await response.json();
  assertNoRawLeakage(body);
  const found = Array.isArray(body?.results) && body.results.some((item) => item?.documentId === documentId);
  assert(!found, 'negative search discovered uploaded document');
  return { status: response.status, discovered: false, resultCount: Number(body?.total ?? 0) };
});

const failed = results.filter((result) => result.result === 'fail');
const summary = {
  status: failed.length === 0 ? 'pass' : 'fail',
  releaseSha: config.releaseSha,
  targetRef: config.targetRef,
  generatedAt: new Date().toISOString(),
  counts: {
    pass: results.filter((result) => result.result === 'pass').length,
    fail: failed.length,
    skip: results.filter((result) => result.result === 'skip').length,
  },
  checks: results,
};

printResult(summary);
if (failed.length > 0) process.exit(1);

async function run(id, name, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    if (evidence?.skipped) {
      record(id, name, 'skip', { reason: evidence.reason, durationMs: Date.now() - started });
      return;
    }
    record(id, name, 'pass', { ...evidence, durationMs: Date.now() - started });
  } catch (error) {
    record(id, name, 'fail', {
      message: error instanceof Error ? error.message : 'unknown failure',
      durationMs: Date.now() - started,
    });
  }
}

function record(id, name, result, evidence) {
  results.push({ id, name, result, evidence: sanitizeEvidence(evidence) });
}

function sanitizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return evidence;
  if (Array.isArray(evidence)) return evidence.map(sanitizeEvidence);
  const safe = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (/password|cookie|token|secret|url|path|filename|title|query|needle|documentId|matterId|clientId|tenantId|userId/i.test(key)) {
      safe[key] = value ? 'redacted' : value;
    } else if (value && typeof value === 'object') {
      safe[key] = sanitizeEvidence(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

function printResult(result) {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`AMIC Vault DMS main-loop smoke: ${result.status}`);
  console.log(`releaseSha=${result.releaseSha}`);
  console.log(`targetRef=${result.targetRef}`);
  for (const check of result.checks) {
    console.log(`${check.result.toUpperCase()} ${check.id} ${check.name}`);
    if (verbose && check.evidence) console.log(`  ${JSON.stringify(check.evidence)}`);
  }
  if (result.counts) {
    console.log(
      `counts pass=${result.counts.pass} fail=${result.counts.fail} skip=${result.counts.skip}`,
    );
  }
  if (result.missing?.length) {
    console.log(`missing ${result.missing.join(', ')}`);
  }
  if (result.holds?.length) {
    console.log(`holds ${result.holds.join(', ')}`);
  }
}

function evaluateEnvironmentReadiness() {
  const checks = [];
  const missing = [];
  const holds = [];

  addEnvCheck(checks, missing, {
    id: 'DMS-ENV-001',
    name: 'API endpoint configured',
    ok: Boolean(config.apiBaseUrl) && isAbsoluteUrl(config.apiBaseUrl),
    required: ['DMS_SMOKE_API_BASE_URL', 'API_BASE_URL'],
    message: config.apiBaseUrl
      ? 'DMS_SMOKE_API_BASE_URL or API_BASE_URL must be an absolute URL'
      : 'DMS_SMOKE_API_BASE_URL or API_BASE_URL is required unless --local supplies a development default',
  });
  addEnvCheck(checks, missing, {
    id: 'DMS-ENV-002',
    name: 'Primary DMS smoke credentials configured',
    ok: hasPrimaryCredentials(),
    required: ['DMS_SMOKE_EMAIL', 'DMS_SMOKE_PASSWORD'],
    alternate: ['SMOKE_EMAIL', 'SMOKE_PASSWORD'],
    message: 'primary DMS smoke credentials are required',
  });
  addEnvCheck(checks, missing, {
    id: 'DMS-ENV-003',
    name: 'Matter source configured before upload',
    ok: Boolean(config.matterId) || config.createSynthetic,
    required: ['DMS_SMOKE_MATTER_ID'],
    alternate: ['DMS_SMOKE_CREATE_SYNTHETIC=1', 'DMS_SMOKE_SYNTHETIC_APPROVED=1'],
    message: 'DMS_SMOKE_MATTER_ID is required unless approved synthetic creation is configured',
  });

  if (config.createSynthetic && !isLocalOrExplicitSynthetic()) {
    holds.push('DMS_SMOKE_CREATE_SYNTHETIC=1 requires --local or DMS_SMOKE_SYNTHETIC_APPROVED=1');
    checks.push({
      id: 'DMS-ENV-004',
      name: 'Synthetic creation explicitly approved',
      result: 'fail',
      evidence: { required: ['--local', 'DMS_SMOKE_SYNTHETIC_APPROVED=1'] },
    });
  } else {
    checks.push({
      id: 'DMS-ENV-004',
      name: 'Synthetic creation explicitly approved',
      result: 'pass',
      evidence: { createSynthetic: config.createSynthetic, localMode },
    });
  }

  if (config.requireAuth) {
    addEnvCheck(checks, missing, {
      id: 'DMS-ENV-005',
      name: 'Negative DMS smoke credentials configured',
      ok: hasNegativeCredentials(),
      required: ['DMS_SMOKE_NEGATIVE_EMAIL', 'DMS_SMOKE_NEGATIVE_PASSWORD'],
      alternate: ['SMOKE_NEGATIVE_EMAIL', 'SMOKE_NEGATIVE_PASSWORD'],
      message: 'negative DMS smoke credentials are required when DMS_SMOKE_REQUIRE_AUTH=1',
    });
  } else {
    holds.push('DMS_SMOKE_REQUIRE_AUTH=1 is required for DMS-UX-802 release evidence');
    checks.push({
      id: 'DMS-ENV-005',
      name: 'Negative DMS smoke credentials configured',
      result: 'fail',
      evidence: { required: ['DMS_SMOKE_REQUIRE_AUTH=1'] },
    });
  }

  if (config.allowIndexPending) {
    holds.push('DMS_SMOKE_ALLOW_INDEX_PENDING=0 is required for release signoff');
    checks.push({
      id: 'DMS-ENV-006',
      name: 'Indexing must not be bypassed for release signoff',
      result: 'fail',
      evidence: { required: ['DMS_SMOKE_ALLOW_INDEX_PENDING=0'] },
    });
  } else {
    checks.push({
      id: 'DMS-ENV-006',
      name: 'Indexing must not be bypassed for release signoff',
      result: 'pass',
      evidence: { required: ['DMS_SMOKE_ALLOW_INDEX_PENDING=0'] },
    });
  }

  const failed = checks.filter((check) => check.result === 'fail');
  return {
    status: failed.length === 0 ? 'pass' : 'hold',
    releaseSha: config.releaseSha,
    targetRef: config.targetRef,
    generatedAt: new Date().toISOString(),
    counts: {
      pass: checks.length - failed.length,
      fail: failed.length,
      skip: 0,
    },
    missing,
    holds,
    checks,
  };
}

function addEnvCheck(checks, missing, input) {
  if (input.ok) {
    checks.push({
      id: input.id,
      name: input.name,
      result: 'pass',
      evidence: {
        required: input.required,
        alternate: input.alternate ?? [],
      },
    });
    return;
  }

  missing.push(input.message);
  checks.push({
    id: input.id,
    name: input.name,
    result: 'fail',
    evidence: {
      required: input.required,
      alternate: input.alternate ?? [],
      message: input.message,
    },
  });
}

function formatEnvironmentReadinessError(readiness) {
  return [
    'DMS smoke environment is not release-ready',
    ...readiness.missing.map((item) => `missing: ${item}`),
    ...readiness.holds.map((item) => `hold: ${item}`),
  ].join('; ');
}

async function createSyntheticClient() {
  const response = await postJson(
    apiUrl('/clients'),
    {
      name: `DMS Smoke Client ${Date.now()}`,
      clientType: 'corporation',
      confidentialityLevel: 'standard',
      status: 'active',
      metadata: { source: 'dms_smoke' },
    },
    sessionCookie,
  );
  assert(response.status === 201 || response.status === 200, `client create status ${response.status}`);
  const body = await response.json();
  assert(body?.clientId, 'client create response missing ref');
  return body.clientId;
}

async function createSyntheticMatter(clientId) {
  const code = `DMS-SMOKE-${Date.now()}`;
  const response = await postJson(
    apiUrl('/matters'),
    {
      clientId,
      matterCode: code,
      matterName: 'DMS smoke matter',
      matterType: 'other',
      practiceGroup: 'SMOKE',
      metadata: { source: 'dms_smoke' },
    },
    sessionCookie,
  );
  assert(response.status === 201 || response.status === 200, `matter create status ${response.status}`);
  const body = await response.json();
  assert(body?.matterId, 'matter create response missing ref');
  return body;
}

async function uploadSmokeDocument(targetMatterId) {
  const { body, filename, mimeType } = smokeFile();
  const form = new FormData();
  form.append('title', uploadTitle);
  form.append('documentType', 'other');
  form.append('confidentialityLevel', 'standard');
  form.append('aiAllowed', 'true');
  form.append('file', new Blob([body], { type: mimeType }), filename);

  const response = await fetchWithTimeout(apiUrl(`/matters/${targetMatterId}/documents`), {
    method: 'POST',
    headers: { cookie: sessionCookie },
    body: form,
  });
  assert(response.status === 201 || response.status === 200, `upload status ${response.status}`);
  return response.json();
}

function smokeFile() {
  if (config.filePath) {
    return {
      body: readFileSync(config.filePath),
      filename: basename(config.filePath),
      mimeType: mimeFromPath(config.filePath),
    };
  }
  return {
    body: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
    filename: 'dms-smoke.pdf',
    mimeType: 'application/pdf',
  };
}

function mimeFromPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.hwpx')) return 'application/hwp+zip';
  return 'application/octet-stream';
}

async function loginNegativeUser() {
  const response = await postJson(apiUrl('/auth/login'), negativeLoginPayload(config));
  assert(response.status === 201 || response.status === 200, `negative login status ${response.status}`);
  const cookie = extractSessionCookie(response.headers.get('set-cookie'));
  assert(cookie, 'negative login missing session cookie');
  return cookie;
}

async function getJsonWithCookie(path, cookie) {
  const response = await fetchWithTimeout(apiUrl(path), { headers: { cookie } });
  assert(response.status === 200, `${path} status ${response.status}`);
  return response.json();
}

async function postJson(url, payload, cookie) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    await delay(0);
  }
}

async function pollFor(fn) {
  for (let attempt = 1; attempt <= config.pollAttempts; attempt += 1) {
    if (await fn()) return true;
    await delay(config.pollDelayMs);
  }
  return false;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiUrl(path) {
  return joinUrl(config.apiBaseUrl, path);
}

function joinUrl(base, path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function normalizeBase(input, name, options = {}) {
  if (!input) {
    if (options.collectOnly) return undefined;
    throw new Error(`${name} is required unless --local supplies a development default`);
  }
  try {
    const url = new URL(input);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    if (options.collectOnly) return input;
    throw new Error(`${name} must be an absolute URL`);
  }
}

function isAbsoluteUrl(input) {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

function value(name, fallback) {
  const current = process.env[name];
  if (current !== undefined && current !== '') return current;
  return fallback;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loginPayload(input) {
  const payload = {
    email: input.email,
    password: input.password,
  };
  if (input.tenantId) payload.tenantId = input.tenantId;
  if (input.tenantSlug) payload.tenantSlug = input.tenantSlug;
  return payload;
}

function negativeLoginPayload(input) {
  const payload = {
    email: input.negativeEmail,
    password: input.negativePassword,
  };
  if (input.negativeTenantId) payload.tenantId = input.negativeTenantId;
  if (input.negativeTenantSlug) payload.tenantSlug = input.negativeTenantSlug;
  return payload;
}

function hasPrimaryCredentials() {
  return Boolean(config.email && config.password);
}

function hasNegativeCredentials() {
  return Boolean(config.negativeEmail && config.negativePassword);
}

function extractSessionCookie(header) {
  if (!header) return undefined;
  const cookies = header.split(/,(?=[^;]+?=)/g);
  const session = cookies.find((cookie) => cookie.trim().startsWith('amic_session='));
  return session?.split(';')[0];
}

function searchNeedleFromTitle(title) {
  return title.split(/\s+/).slice(0, 3).join(' ');
}

function safeHeader(value) {
  return String(value ?? '').split(';')[0].slice(0, 80);
}

function isSafeDenialOrUnavailableCode(code) {
  return ['PERMISSION_DENIED', 'AUTH_REQUIRED', 'VALIDATION_FAILED', 'DOCUMENT_LOCKED'].includes(
    String(code ?? ''),
  );
}

function assertSafeDeniedBody(body) {
  if (!body || typeof body !== 'object') return;
  const code = String(body.code ?? '');
  if (code) assert(isSafeDenialOrUnavailableCode(code), `unsafe denial code ${code}`);
  assertNoRawLeakage(body);
}

function assertNoKnownRefsInBody(body) {
  const rendered = JSON.stringify(body);
  for (const ref of [documentId, matterId].filter(Boolean)) {
    assert(!rendered.includes(ref), 'denied response leaked protected ref');
  }
}

function assertNoRawLeakage(value) {
  const rendered = JSON.stringify(value);
  assert(
    !/(raw_body|document_body|source_text|sourceText|raw_prompt|prompt_text|model_response|password|secret|token|cookie)/i.test(
      rendered,
    ),
    'response included unsafe raw field marker',
  );
}

function isLocalOrExplicitSynthetic() {
  return localMode || value('DMS_SMOKE_SYNTHETIC_APPROVED', '0') === '1';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeGitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}
