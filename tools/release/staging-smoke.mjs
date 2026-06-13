#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const args = new Set(process.argv.slice(2));
const localMode = args.has('--local');
const dryRun = args.has('--dry-run');
const publicOnly = args.has('--public-only');
const jsonOutput = args.has('--json');
const verbose = args.has('--verbose');

const defaultTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const repoSha = safeGitSha();

const config = {
  apiBaseUrl: normalizeBase(
    value('API_BASE_URL', localMode ? 'http://localhost:3001/v1' : dryRun ? 'https://api.example.invalid/v1' : undefined),
    'API_BASE_URL',
  ),
  webBaseUrl: normalizeBase(
    value('WEB_BASE_URL', localMode ? 'http://localhost:3000' : dryRun ? 'https://web.example.invalid' : undefined),
    'WEB_BASE_URL',
  ),
  releaseSha: value('RELEASE_SHA', repoSha),
  targetRef: value('SMOKE_TARGET_REF', localMode ? 'local-dev' : 'approved-staging-ref'),
  requireAuth: value('SMOKE_REQUIRE_AUTH', localMode ? '1' : '0') === '1',
  tenantId: value('SMOKE_TENANT_ID', localMode ? '11111111-1111-4111-8111-111111111111' : undefined),
  tenantSlug: value('SMOKE_TENANT_SLUG', undefined),
  email: value('SMOKE_EMAIL', localMode ? 'alpha-firm-admin@test.local' : undefined),
  password: value('SMOKE_PASSWORD', localMode ? 'dev-alpha-firm-admin-password' : undefined),
  negativeTenantId: value(
    'SMOKE_NEGATIVE_TENANT_ID',
    localMode ? '22222222-2222-4222-8222-222222222222' : undefined,
  ),
  negativeEmail: value('SMOKE_NEGATIVE_EMAIL', localMode ? 'beta-member@test.local' : undefined),
  negativePassword: value('SMOKE_NEGATIVE_PASSWORD', localMode ? 'dev-beta-member-password' : undefined),
  timeoutMs: Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs > 0 ? defaultTimeoutMs : 10_000,
};

const plannedChecks = [
  ['SMOKE-001', 'API live and ready health'],
  ['SMOKE-002', 'Web login page renders'],
  ['SMOKE-003', 'Dashboard redirects to login without session'],
  ['SMOKE-004', 'Next static asset loads'],
  ['SMOKE-005', 'Login with approved synthetic user'],
  ['SMOKE-006', 'Dashboard renders with session cookie'],
  ['SMOKE-007', 'Search page renders with session cookie'],
  ['SMOKE-008', 'Protected tenant API returns tenant-scoped response'],
  ['SMOKE-009', 'Negative role check denies tenant settings'],
  ['SMOKE-010', 'Audit event query returns reference-only event list'],
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

const results = [];
let sessionCookie;

await run('SMOKE-001', 'API live and ready health', async () => {
  const live = await getJson(apiUrl('/health/live'));
  const ready = await getJson(apiUrl('/health/ready'));
  assert(live.status === 'ok', 'live health did not return ok');
  assert(ready.status === 'ok', 'ready health did not return ok');
  return { live: 'ok', ready: 'ok' };
});

let loginHtml = '';
await run('SMOKE-002', 'Web login page renders', async () => {
  const response = await fetchWithTimeout(webUrl('/login'));
  assert(response.status === 200, `unexpected status ${response.status}`);
  loginHtml = await response.text();
  assert(loginHtml.includes('AMIC Vault'), 'login page missing AMIC Vault title');
  assert(loginHtml.includes('Tenant ID'), 'login page missing Tenant ID field');
  return { status: response.status };
});

await run('SMOKE-003', 'Dashboard redirects to login without session', async () => {
  const response = await fetchWithTimeout(webUrl('/dashboard'), { redirect: 'manual' });
  const location = response.headers.get('location') ?? '';
  assert([301, 302, 303, 307, 308].includes(response.status), `unexpected status ${response.status}`);
  assert(location.includes('/login'), 'redirect location did not point to login');
  return { status: response.status, redirect: safeRedirect(location) };
});

await run('SMOKE-004', 'Next static asset loads', async () => {
  const assetPath = firstStaticAsset(loginHtml);
  assert(assetPath, 'no static asset found on login page');
  const response = await fetchWithTimeout(webUrl(assetPath));
  assert(response.status === 200, `asset status ${response.status}`);
  return { status: response.status, assetKind: assetPath.endsWith('.css') ? 'css' : 'js' };
});

if (publicOnly) {
  for (const [id, name] of plannedChecks.slice(4)) {
    record(id, name, 'skip', { reason: 'public-only mode' });
  }
} else {
  await run('SMOKE-005', 'Login with approved synthetic user', async () => {
    assert(hasPrimaryCredentials(), 'missing primary smoke credentials');
    const response = await fetchWithTimeout(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(loginPayload(config)),
    });
    assert(response.status === 201 || response.status === 200, `login status ${response.status}`);
    const body = await response.json();
    assert(body?.user?.tenantId, 'login response missing tenant context');
    sessionCookie = extractSessionCookie(response.headers.get('set-cookie'));
    assert(sessionCookie, 'login response missing session cookie');
    return { status: response.status, tenantScoped: true, cookie: 'present' };
  });

  await run('SMOKE-006', 'Dashboard renders with session cookie', async () => {
    assert(sessionCookie, 'missing session cookie from SMOKE-005');
    const response = await fetchWithTimeout(webUrl('/dashboard'), {
      headers: { cookie: sessionCookie },
    });
    assert(response.status === 200, `dashboard status ${response.status}`);
    const html = await response.text();
    assert(html.includes('AMIC Vault'), 'dashboard missing app shell');
    assert(html.includes('Live Activity') || html.includes('Matter'), 'dashboard missing activity content');
    return { status: response.status };
  });

  await run('SMOKE-007', 'Search page renders with session cookie', async () => {
    assert(sessionCookie, 'missing session cookie from SMOKE-005');
    const response = await fetchWithTimeout(webUrl('/search'), {
      headers: { cookie: sessionCookie },
    });
    assert(response.status === 200, `search status ${response.status}`);
    const html = await response.text();
    assert(html.includes('Search') || html.includes('AMIC Vault'), 'search page missing protected content');
    return { status: response.status };
  });

  await run('SMOKE-008', 'Protected tenant API returns tenant-scoped response', async () => {
    assert(sessionCookie, 'missing session cookie from SMOKE-005');
    const response = await fetchWithTimeout(apiUrl('/tenant/settings'), {
      headers: { cookie: sessionCookie },
    });
    assert(response.status === 200, `tenant settings status ${response.status}`);
    const body = await response.json();
    assert(body?.tenantId, 'tenant settings missing tenant id');
    return { status: response.status, tenantScoped: true };
  });

  await run('SMOKE-009', 'Negative role check denies tenant settings', async () => {
    if (!hasNegativeCredentials()) {
      if (config.requireAuth) throw new Error('missing negative smoke credentials');
      return { skipped: true, reason: 'negative credentials not provided' };
    }
    const login = await fetchWithTimeout(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: config.negativeTenantId,
        email: config.negativeEmail,
        password: config.negativePassword,
      }),
    });
    assert(login.status === 201 || login.status === 200, `negative login status ${login.status}`);
    const negativeCookie = extractSessionCookie(login.headers.get('set-cookie'));
    assert(negativeCookie, 'negative login missing session cookie');
    const denied = await fetchWithTimeout(apiUrl('/tenant/settings'), {
      headers: { cookie: negativeCookie },
    });
    assert(denied.status === 403 || denied.status === 401, `negative check status ${denied.status}`);
    const body = await denied.json().catch(() => ({}));
    assert(
      body?.code === 'PERMISSION_DENIED' || body?.code === 'AUTH_REQUIRED',
      'negative check did not return a safe denial code',
    );
    return { status: denied.status, denialCode: body?.code ?? 'safe-denied' };
  });

  await run('SMOKE-010', 'Audit event query returns reference-only event list', async () => {
    assert(sessionCookie, 'missing session cookie from SMOKE-005');
    const response = await fetchWithTimeout(apiUrl('/audit-events?limit=1'), {
      headers: { cookie: sessionCookie },
    });
    assert(response.status === 200, `audit status ${response.status}`);
    const body = await response.json();
    assert(Array.isArray(body?.items), 'audit response missing items array');
    const rendered = JSON.stringify(body.items);
    assert(!/(raw_body|document_body|source_text|password|secret|token)/i.test(rendered), 'audit response included unsafe raw field marker');
    return { status: response.status, items: body.items.length };
  });
}

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
  const safe = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (/password|cookie|token|secret|url/i.test(key)) {
      safe[key] = value ? 'redacted' : value;
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
  console.log(`AMIC Vault staging smoke: ${result.status}`);
  console.log(`releaseSha=${result.releaseSha}`);
  console.log(`targetRef=${result.targetRef}`);
  for (const check of result.checks) {
    console.log(`${check.result.toUpperCase()} ${check.id} ${check.name}`);
    if (verbose && check.evidence) console.log(`  ${JSON.stringify(check.evidence)}`);
  }
  if (result.counts) {
    console.log(`counts pass=${result.counts.pass} fail=${result.counts.fail} skip=${result.counts.skip}`);
  }
}

async function getJson(url) {
  const response = await fetchWithTimeout(url);
  assert(response.status === 200, `unexpected status ${response.status}`);
  return response.json();
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

function apiUrl(path) {
  return joinUrl(config.apiBaseUrl, path);
}

function webUrl(path) {
  return joinUrl(config.webBaseUrl, path);
}

function joinUrl(base, path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function normalizeBase(input, name) {
  if (!input) throw new Error(`${name} is required unless --local supplies a development default`);
  try {
    const url = new URL(input);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function value(name, fallback) {
  const current = process.env[name];
  if (current !== undefined && current !== '') return current;
  return fallback;
}

function hasPrimaryCredentials() {
  return Boolean((config.tenantId || config.tenantSlug) && config.email && config.password);
}

function hasNegativeCredentials() {
  return Boolean(config.negativeTenantId && config.negativeEmail && config.negativePassword);
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

function extractSessionCookie(setCookie) {
  if (!setCookie) return undefined;
  const match = setCookie.match(/(?:^|,\s*)amic_session=([^;]+)/);
  if (!match) return undefined;
  return `amic_session=${match[1]}`;
}

function firstStaticAsset(html) {
  const match = html.match(/(?:href|src)="(\/_next\/static\/[^"]+)"/);
  return match?.[1];
}

function safeRedirect(location) {
  if (!location) return 'missing';
  try {
    const url = new URL(location, config.webBaseUrl);
    return url.pathname;
  } catch {
    return 'unparseable';
  }
}

function safeGitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
