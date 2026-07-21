import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateInventory } from './check-evidence-manifest.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const EXTERNAL_KINDS = new Set(['npm', 'python', 'image']);

function fail(message) {
  throw new Error(`oss license policy failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function componentPolicy(policy, input) {
  const fallback = EXTERNAL_KINDS.has(input.kind) ? policy.defaults.external : policy.defaults.workspace;
  return { ...clone(fallback), ...clone(policy.components?.[input.inputKey] ?? {}) };
}

function assertApprovalShape(component, inputKey) {
  const approval = component.approval;
  assert(approval && typeof approval === 'object', `${inputKey}: approval missing`);
  assert(['APPROVED', 'BLOCKED', 'INTERNAL'].includes(approval.decision), `${inputKey}: invalid approval decision`);
  assert(typeof approval.owner === 'string' && approval.owner.trim(), `${inputKey}: approval owner missing`);
  return approval;
}

function hasFutureApproval(approval, now, maxAgeDays, inputKey) {
  assert(ISO_DATE.test(approval.issuedAt ?? ''), `${inputKey}: approved component missing issuedAt`);
  assert(ISO_DATE.test(approval.expiresAt ?? ''), `${inputKey}: approved component missing expiresAt`);
  const issued = new Date(`${approval.issuedAt}T00:00:00.000Z`);
  const expires = new Date(`${approval.expiresAt}T23:59:59.999Z`);
  assert(!Number.isNaN(issued.valueOf()) && !Number.isNaN(expires.valueOf()), `${inputKey}: approval date invalid`);
  assert(issued <= now, `${inputKey}: approval issued in the future`);
  assert(expires >= now, `${inputKey}: approval expired`);
  assert(now.valueOf() - issued.valueOf() <= maxAgeDays * 86_400_000, `${inputKey}: approval exceeds maximum age`);
}

function assertDeliveryObligations(component, inputKey) {
  const isModified = ['L2', 'L3'].includes(component.adoptionMode);
  if (isModified) {
    assert(typeof component.approval.fileMap === 'string' && component.approval.fileMap.trim(), `${inputKey}: ${component.adoptionMode} requires fileMap`);
    assert(typeof component.approval.sourceOffer === 'string' && component.approval.sourceOffer.trim(), `${inputKey}: ${component.adoptionMode} requires sourceOffer`);
    assert(typeof component.approval.exitPlan === 'string' && component.approval.exitPlan.trim(), `${inputKey}: ${component.adoptionMode} requires exitPlan`);
  }
  const agplDelivery = component.spdxExpression.startsWith('AGPL-')
    && component.deliveryProfiles.some((profile) => ['ON_PREM', 'NETWORK_SERVICE'].includes(profile));
  if (agplDelivery) {
    assert(typeof component.approval.sourceOffer === 'string' && component.approval.sourceOffer.trim(), `${inputKey}: AGPL delivery requires sourceOffer`);
  }
}

function classifyLicense(allowlist, spdxExpression) {
  if (allowlist.deniedSpdx.includes(spdxExpression)) return 'DENIED';
  if (allowlist.allowedSpdx.includes(spdxExpression)) return 'ALLOWED';
  if (allowlist.reviewRequiredSpdx.includes(spdxExpression)) return 'REVIEW_REQUIRED';
  return 'UNKNOWN';
}

function validateComponent(allowlist, component, input, now) {
  const inputKey = input.inputKey;
  assert(['L0', 'L1', 'L2', 'L3', 'L4'].includes(component.adoptionMode), `${inputKey}: invalid adoptionMode`);
  assert(Array.isArray(component.deliveryProfiles) && component.deliveryProfiles.length > 0, `${inputKey}: deliveryProfiles missing`);
  for (const profile of component.deliveryProfiles) assert(['SAAS', 'ON_PREM', 'NETWORK_SERVICE'].includes(profile), `${inputKey}: invalid delivery profile`);
  assert(typeof component.shipped === 'boolean', `${inputKey}: shipped must be boolean`);
  if (component.adoptionMode === 'L4') assert(!component.shipped, `${inputKey}: L4 research candidate cannot be shipped`);
  const approval = assertApprovalShape(component, inputKey);
  if (approval.decision === 'INTERNAL') {
    assert(input.kind === 'workspace' && component.sourceType === 'internal', `${inputKey}: INTERNAL decision is reserved for workspaces`);
    return { state: 'INTERNAL', component };
  }
  const licenseClass = classifyLicense(allowlist, component.spdxExpression);
  if (approval.decision === 'BLOCKED') return { state: 'BLOCKED', licenseClass, component };
  assert(licenseClass !== 'DENIED', `${inputKey}: denied license cannot be approved`);
  assert(licenseClass !== 'UNKNOWN', `${inputKey}: unknown or custom license cannot be approved`);
  hasFutureApproval(approval, now, allowlist.approvalMaxAgeDays, inputKey);
  assertDeliveryObligations(component, inputKey);
  return { state: 'APPROVED', licenseClass, component };
}

export function renderNotice(rows) {
  const shipped = rows.filter((row) => row.state === 'APPROVED' && row.component.shipped);
  if (shipped.length === 0) return '# Third-Party Notices\n\nNo approved shipped OSS components are recorded.\n';
  return ['# Third-Party Notices', '', ...shipped.map((row) => `- ${row.inputKey}: ${row.component.spdxExpression}`), ''].join('\n');
}

export function evaluateLicensePolicy({
  repoRoot = process.cwd(),
  provenancePath = 'security/oss-provenance.yml',
  policyPath = 'security/oss-license-policy.yml',
  allowlistPath = 'security/oss-allowlist.yml',
  now = new Date(),
} = {}) {
  const inventory = validateInventory({ repoRoot, provenancePath });
  const resolvedRoot = resolve(repoRoot);
  const policy = readJson(resolve(resolvedRoot, policyPath));
  const allowlist = readJson(resolve(resolvedRoot, allowlistPath));
  assert(policy.schemaVersion === 'oss-license-policy-v1', 'unsupported policy schemaVersion');
  assert(allowlist.schemaVersion === 'oss-license-allowlist-v1', 'unsupported allowlist schemaVersion');
  for (const key of ['allowedSpdx', 'reviewRequiredSpdx', 'deniedSpdx']) assert(Array.isArray(allowlist[key]), `allowlist ${key} missing`);
  assert(Number.isInteger(allowlist.approvalMaxAgeDays) && allowlist.approvalMaxAgeDays > 0, 'allowlist approvalMaxAgeDays invalid');
  assert(policy.defaults?.external && policy.defaults?.workspace, 'policy defaults missing');

  const rows = inventory.inputs.map((input) => {
    const component = componentPolicy(policy, input);
    return { inputKey: input.inputKey, kind: input.kind, ...validateComponent(allowlist, component, input, now) };
  });
  return {
    sourceSha: inventory.baseline.sourceSha,
    sourceTree: inventory.baseline.sourceTree,
    total: rows.length,
    approved: rows.filter((row) => row.state === 'APPROVED').length,
    blocked: rows.filter((row) => row.state === 'BLOCKED').length,
    internal: rows.filter((row) => row.state === 'INTERNAL').length,
    rows,
    notice: renderNotice(rows),
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = evaluateLicensePolicy();
  console.log(JSON.stringify({
    status: 'ok',
    sourceSha: result.sourceSha,
    sourceTree: result.sourceTree,
    total: result.total,
    approved: result.approved,
    blocked: result.blocked,
    internal: result.internal,
  }, null, 2));
}
