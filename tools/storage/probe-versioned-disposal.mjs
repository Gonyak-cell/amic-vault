import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const schemaVersion = 'amic-vault.versioned-storage-disposal-probe/v1';
const probeBucketPattern = /^amic-vault-disposal-probe-(?:versioned|unversioned)-[a-z0-9-]{8,50}$/;
const runIdPattern = /^[a-z0-9]{12,48}$/;

function blocked(reason) {
  return { schemaVersion, status: 'BLOCKED', reason };
}

function readRequired(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error('PROBE_ENV_INVALID');
  return value;
}

/** Parses only the disposable local-probe contract; it never accepts a default application bucket. */
export function parseProbeEnvironment(env = process.env) {
  if (env.S3_DISPOSAL_PROBE_ALLOW !== 'synthetic-disposable') {
    throw new Error('PROBE_NOT_EXPLICITLY_ENABLED');
  }
  const versionedBucket = readRequired(env, 'S3_DISPOSAL_PROBE_VERSIONED_BUCKET');
  const unversionedBucket = readRequired(env, 'S3_DISPOSAL_PROBE_UNVERSIONED_BUCKET');
  const runId = readRequired(env, 'S3_DISPOSAL_PROBE_RUN_ID');
  if (
    !probeBucketPattern.test(versionedBucket) ||
    !probeBucketPattern.test(unversionedBucket) ||
    versionedBucket === unversionedBucket ||
    !runIdPattern.test(runId)
  ) {
    throw new Error('PROBE_SCOPE_INVALID');
  }
  return {
    endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: env.S3_REGION ?? 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? 'amic-vault-minio',
    secretAccessKey:
      env.S3_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? 'amic-vault-minio-dev-password',
    versionedBucket,
    unversionedBucket,
    runId,
  };
}

export async function runVersionedDisposalProbe({ config, createAdapter, probe }) {
  const versioned = await probe(createAdapter(config.versionedBucket), {
    key: `synthetic/${config.runId}/object`,
    crossTenantKey: `synthetic/${config.runId}/cross-tenant-object`,
  });
  const unversioned = await probe(createAdapter(config.unversionedBucket), {
    key: `synthetic/${config.runId}/unversioned-object`,
    crossTenantKey: `synthetic/${config.runId}/cross-tenant-object`,
  });
  if (versioned.status !== 'SUPPORTED') return blocked('VERSIONED_CAPABILITY_NOT_PROVEN');
  if (unversioned.status !== 'UNSUPPORTED' || unversioned.reason !== 'VERSIONING_DISABLED') {
    return blocked('UNVERSIONED_BUCKET_NOT_REJECTED');
  }
  return {
    schemaVersion,
    status: 'PASS',
    exactInventory: true,
    exactHead: true,
    exactDelete: true,
    readbackAbsent: true,
    deleteMarker: true,
    wrongVersionDenied: true,
    crossTenantKeyDenied: true,
    unversionedRejected: true,
  };
}

async function main() {
  try {
    const config = parseProbeEnvironment();
    const require = createRequire(import.meta.url);
    const { S3StorageAdapter } = require('../../apps/api/dist/modules/storage/s3-storage.adapter.js');
    const { probeVersionedStorageCapability } = require(
      '../../apps/api/dist/modules/storage/versioned-storage-capability.js',
    );
    const result = await runVersionedDisposalProbe({
      config,
      createAdapter: (bucket) =>
        new S3StorageAdapter({
          endpoint: config.endpoint,
          bucket,
          region: config.region,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        }),
      probe: probeVersionedStorageCapability,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch {
    process.stdout.write(`${JSON.stringify(blocked('PROBE_EXECUTION_UNAVAILABLE'))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
