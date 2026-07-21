import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLicensePolicy } from './check-oss-license-policy.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PREDICATE_TYPE = 'https://amic-vault.local/unsigned-release-identity/v1';
const REQUIRED_IMAGES = new Set(['api', 'web', 'ingestion']);

function fail(message) {
  throw new Error(`release identity verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function hash(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function canonical(value) {
  return JSON.stringify(value);
}

function assertSourceIdentity(value, label) {
  assert(SHA.test(value?.sourceSha), `${label}: sourceSha invalid`);
  assert(SHA.test(value?.sourceTree), `${label}: sourceTree invalid`);
}

export function summarizeLicensePolicy(value) {
  assert(Number.isInteger(value?.total) && value.total >= 0, 'license policy total invalid');
  assert(Number.isInteger(value?.approved) && value.approved >= 0, 'license policy approved invalid');
  assert(Number.isInteger(value?.blocked) && value.blocked >= 0, 'license policy blocked invalid');
  assert(Number.isInteger(value?.internal) && value.internal >= 0, 'license policy internal invalid');
  return {
    total: value.total,
    approved: value.approved,
    blocked: value.blocked,
    internal: value.internal,
    unresolved: 0,
    releaseSafe: value.blocked === 0,
  };
}

export function buildUnsignedReleaseIdentity({ sbomManifest, sbomManifestContents, scanSummary, scanSummaryContents, licensePolicy }) {
  assertSourceIdentity(sbomManifest, 'SBOM manifest');
  assertSourceIdentity(scanSummary, 'scan summary');
  assert(sbomManifest.sourceSha === scanSummary.sourceSha, 'replayed artifact source SHA mismatch');
  assert(sbomManifest.sourceTree === scanSummary.sourceTree, 'replayed artifact source tree mismatch');
  assert(Array.isArray(sbomManifest.sboms), 'SBOM manifest entries missing');
  assert(scanSummary?.schema === 'amic-vault.security-scan-summary.v1', 'scan summary schema invalid');
  assert(Number.isInteger(scanSummary?.productionHighCritical?.unclassified), 'scan policy state missing');
  assert(scanSummary.productionHighCritical.unclassified === 0, 'unresolved production High/Critical finding');
  assert(Number.isInteger(licensePolicy?.unresolved), 'license policy unresolved state missing');
  assert(licensePolicy.unresolved === 0, 'unresolved license state');

  const sourceSbom = sbomManifest.sboms.find((sbom) => sbom.name === 'source');
  assert(sourceSbom && sourceSbom.imageDigest === null && DIGEST.test(sourceSbom.fileSha256), 'source SBOM edge invalid');
  const imageSboms = sbomManifest.sboms.filter((sbom) => sbom.name !== 'source');
  assert(imageSboms.length === REQUIRED_IMAGES.size, 'expected exactly three image SBOM edges');
  const imageNames = new Set(imageSboms.map((sbom) => sbom.name));
  assert(imageNames.size === imageSboms.length && [...REQUIRED_IMAGES].every((name) => imageNames.has(name)), 'image SBOM names invalid');
  for (const sbom of imageSboms) {
    assert(DIGEST.test(sbom.imageDigest), `${sbom.name}: image digest invalid`);
    assert(DIGEST.test(sbom.fileSha256), `${sbom.name}: SBOM hash invalid`);
    assert(DIGEST.test(sbom.normalizedComponentHash), `${sbom.name}: normalized component hash invalid`);
  }

  const policy = {
    license: licensePolicy,
    productionHighCritical: {
      unclassified: scanSummary.productionHighCritical.unclassified,
      blocked: scanSummary.productionHighCritical.blocked,
      releaseSafe: scanSummary.productionHighCritical.releaseSafe,
    },
  };
  return {
    schema: 'amic-vault.unsigned-release-identity.v1',
    predicateType: PREDICATE_TYPE,
    sourceSha: sbomManifest.sourceSha,
    sourceTree: sbomManifest.sourceTree,
    artifacts: {
      sbomManifestHash: hash(sbomManifestContents),
      scanSummaryHash: hash(scanSummaryContents),
      sourceSbomHash: sourceSbom.fileSha256,
      images: imageSboms.map(({ name, imageDigest, fileSha256, normalizedComponentHash }) => ({ name, imageDigest, sbomHash: fileSha256, normalizedComponentHash })).sort((left, right) => left.name.localeCompare(right.name)),
    },
    policy,
    localIntegrity: true,
    releaseSafe: policy.license.releaseSafe && policy.productionHighCritical.releaseSafe,
  };
}

export function verifyUnsignedReleaseIdentity(bundle) {
  assert(bundle?.schema === 'amic-vault.unsigned-release-identity.v1', 'identity schema invalid');
  assert(bundle?.predicateType === PREDICATE_TYPE, 'identity predicate missing or invalid');
  assertSourceIdentity(bundle, 'identity bundle');
  assert(DIGEST.test(bundle?.artifacts?.sbomManifestHash), 'SBOM manifest hash missing');
  assert(DIGEST.test(bundle?.artifacts?.scanSummaryHash), 'scan summary hash missing');
  assert(DIGEST.test(bundle?.artifacts?.sourceSbomHash), 'source SBOM hash missing');
  assert(bundle.localIntegrity === true, 'local integrity predicate missing');
  assert(Number.isInteger(bundle?.policy?.license?.unresolved) && bundle.policy.license.unresolved === 0, 'identity has unresolved license state');
  assert(Number.isInteger(bundle?.policy?.productionHighCritical?.unclassified) && bundle.policy.productionHighCritical.unclassified === 0, 'identity has unresolved High/Critical state');
  assert(Array.isArray(bundle?.artifacts?.images) && bundle.artifacts.images.length === REQUIRED_IMAGES.size, 'identity image edges missing');
  const imageNames = new Set(bundle.artifacts.images.map((image) => image.name));
  for (const image of bundle.artifacts.images) {
    assert(REQUIRED_IMAGES.has(image.name) && DIGEST.test(image.imageDigest) && DIGEST.test(image.sbomHash) && DIGEST.test(image.normalizedComponentHash), 'identity image edge invalid');
  }
  assert(imageNames.size === REQUIRED_IMAGES.size, 'identity duplicate or missing image edge');
  return bundle;
}

export function signingBoundaryReceipt(bundle) {
  verifyUnsignedReleaseIdentity(bundle);
  return {
    schema: 'amic-vault.signing-boundary-receipt.v1',
    sourceSha: bundle.sourceSha,
    sourceTree: bundle.sourceTree,
    identityHash: hash(`${canonical(bundle)}\n`),
    status: 'EXTERNAL_BLOCKED_SIGNING_IDENTITY_REQUIRED',
    signingPerformed: false,
    reason: 'Cosign keyless signing, certificate issuance, OIDC identity, registry writes, and signature verification require separately authorized external CI identity.',
  };
}

export function verifyReleaseIdentityFiles({ repoRoot = process.cwd(), sbomPath, scanPath, outDir, licensePolicy = evaluateLicensePolicy({ repoRoot }) } = {}) {
  assert(typeof sbomPath === 'string' && sbomPath, 'SBOM manifest path is required');
  assert(typeof scanPath === 'string' && scanPath, 'scan summary path is required');
  assert(typeof outDir === 'string' && outDir, 'output directory is required');
  const sbomManifestContents = readFileSync(sbomPath, 'utf8');
  const scanSummaryContents = readFileSync(scanPath, 'utf8');
  const bundle = verifyUnsignedReleaseIdentity(buildUnsignedReleaseIdentity({
    sbomManifest: JSON.parse(sbomManifestContents),
    sbomManifestContents,
    scanSummary: JSON.parse(scanSummaryContents),
    scanSummaryContents,
    licensePolicy: summarizeLicensePolicy(licensePolicy),
  }));
  const boundary = signingBoundaryReceipt(bundle);
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(resolve(outDir, 'unsigned-release-identity.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  writeFileSync(resolve(outDir, 'signing-boundary-receipt.json'), `${JSON.stringify(boundary, null, 2)}\n`);
  return { bundle, boundary };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--sbom') result.sbomPath = args[++index];
    else if (value === '--scan') result.scanPath = args[++index];
    else if (value === '--out') result.outDir = args[++index];
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { bundle, boundary } = verifyReleaseIdentityFiles(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ status: 'ok', sourceSha: bundle.sourceSha, sourceTree: bundle.sourceTree, releaseSafe: bundle.releaseSafe, signingStatus: boundary.status }, null, 2));
}
