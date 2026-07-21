import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnsignedReleaseIdentity, signingBoundaryReceipt, verifyUnsignedReleaseIdentity } from './verify-release-identity.mjs';

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const DIGEST = `sha256:${'c'.repeat(64)}`;
const scan = {
  schema: 'amic-vault.security-scan-summary.v1',
  sourceSha: SHA,
  sourceTree: TREE,
  productionHighCritical: { unclassified: 0, blocked: 1, releaseSafe: false },
};
const sbom = {
  sourceSha: SHA,
  sourceTree: TREE,
  sboms: [
    { name: 'source', imageDigest: null, fileSha256: DIGEST },
    ...['api', 'web', 'ingestion'].map((name) => ({ name, imageDigest: DIGEST, fileSha256: DIGEST, normalizedComponentHash: DIGEST })),
  ],
};
const license = { total: 2, approved: 0, blocked: 2, internal: 0, unresolved: 0, releaseSafe: false };

test('binds source, three immutable image edges, SBOMs, scan, and blocked signing boundary', () => {
  const bundle = buildUnsignedReleaseIdentity({ sbomManifest: sbom, sbomManifestContents: '{"sbom":true}', scanSummary: scan, scanSummaryContents: '{"scan":true}', licensePolicy: license });
  assert.equal(verifyUnsignedReleaseIdentity(bundle).releaseSafe, false);
  assert.deepEqual(signingBoundaryReceipt(bundle), {
    schema: 'amic-vault.signing-boundary-receipt.v1',
    sourceSha: SHA,
    sourceTree: TREE,
    identityHash: signingBoundaryReceipt(bundle).identityHash,
    status: 'EXTERNAL_BLOCKED_SIGNING_IDENTITY_REQUIRED',
    signingPerformed: false,
    reason: 'Cosign keyless signing, certificate issuance, OIDC identity, registry writes, and signature verification require separately authorized external CI identity.',
  });
});

test('rejects wrong source, digest, missing predicate, replayed scan, and unresolved policy state', () => {
  assert.throws(() => buildUnsignedReleaseIdentity({ sbomManifest: { ...sbom, sourceSha: 'z'.repeat(40) }, sbomManifestContents: '{}', scanSummary: scan, scanSummaryContents: '{}', licensePolicy: license }), /sourceSha invalid/);
  assert.throws(() => buildUnsignedReleaseIdentity({ sbomManifest: { ...sbom, sboms: [{ ...sbom.sboms[0] }, { ...sbom.sboms[1], imageDigest: 'latest' }, ...sbom.sboms.slice(2)] }, sbomManifestContents: '{}', scanSummary: scan, scanSummaryContents: '{}', licensePolicy: license }), /image digest invalid/);
  assert.throws(() => buildUnsignedReleaseIdentity({ sbomManifest: sbom, sbomManifestContents: '{}', scanSummary: { ...scan, sourceTree: 'd'.repeat(40) }, scanSummaryContents: '{}', licensePolicy: license }), /replayed artifact/);
  const bundle = buildUnsignedReleaseIdentity({ sbomManifest: sbom, sbomManifestContents: '{}', scanSummary: scan, scanSummaryContents: '{}', licensePolicy: license });
  assert.throws(() => verifyUnsignedReleaseIdentity({ ...bundle, predicateType: undefined }), /predicate/);
  assert.throws(() => buildUnsignedReleaseIdentity({ sbomManifest: sbom, sbomManifestContents: '{}', scanSummary: { ...scan, productionHighCritical: { ...scan.productionHighCritical, unclassified: 1 } }, scanSummaryContents: '{}', licensePolicy: license }), /unresolved production/);
  assert.throws(() => buildUnsignedReleaseIdentity({ sbomManifest: sbom, sbomManifestContents: '{}', scanSummary: scan, scanSummaryContents: '{}', licensePolicy: { ...license, unresolved: 1 } }), /unresolved license/);
});
