import crypto from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parsePilotWriteArgs,
  runPilotWrite,
  type PilotWriteCliArgs,
} from './onedrive-pilot-write-runner';

type UploadedFieldsProbe = { fields: Record<string, unknown> };

const candidateId = 'candidate-a';
const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const actorUserId = '11111111-1111-4111-8111-111111111101';

const mapping = {
  candidate_id: candidateId,
  status: 'ready_for_write_mode',
  scope_kind: 'pilot_matter',
  single_matter_scope: true,
  duplicate_policy: 'new_document',
  unsupported_type_policy: 'skip_with_receipt',
  zero_byte_policy: 'skip_with_receipt',
  large_object_policy: 'worker_stream_only',
  cutover_policy: 'not_requested',
};

const target = {
  candidate_id: candidateId,
  tenant_id: tenantId,
  tenant_slug: 'tenant-alpha',
  matter_id: matterId,
  actor_user_id: actorUserId,
  upload_preflight_ref: 'upf_ref',
  target_approval_ref: 'target-approval-ref',
  scope_kind: 'pilot_matter',
  single_matter_scope: true,
  document_defaults: {
    document_type: 'other',
    confidentiality_level: 'standard',
    privilege_status: 'none',
    ai_allowed: false,
  },
};

function sha256Key(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fixtureFiles(
  options: { sourceKey?: string | undefined; targetOverride?: Record<string, unknown> } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-pilot-write-runner-test-'));
  const key = options.sourceKey ?? 'provider-root/Client Alpha/Matter One/secret.docx';
  const scope = path.join(dir, 'scope.ndjson');
  const sourceManifest = path.join(dir, 'source.ndjson');
  const mappingPath = path.join(dir, 'mapping.json');
  const targetPath = path.join(dir, 'target.local.json');
  const sanitizedOut = path.join(dir, 'sanitized.json');
  const localReceiptOut = path.join(dir, 'receipt.local.ndjson');
  const statePath = path.join(dir, 'state.local.json');
  await writeFile(
    scope,
    `${JSON.stringify({
      candidate_id: candidateId,
      source_object_hash: sha256Key(key),
      extension: '.docx',
      size_bytes: 12,
      readable: true,
    })}\n`,
    'utf8',
  );
  await writeFile(
    sourceManifest,
    `${JSON.stringify({ bucket: 'raw-bucket', key, size: 12 })}\n`,
    'utf8',
  );
  await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, 'utf8');
  await writeFile(
    targetPath,
    `${JSON.stringify({ ...target, ...options.targetOverride })}\n`,
    'utf8',
  );
  return {
    scope,
    sourceManifest,
    mappingPath,
    targetPath,
    sanitizedOut,
    localReceiptOut,
    statePath,
  };
}

function args(files: Awaited<ReturnType<typeof fixtureFiles>>, execute = false): PilotWriteCliArgs {
  return {
    runId: 'run-a',
    candidateId,
    scopePath: files.scope,
    mappingPath: files.mappingPath,
    targetPath: files.targetPath,
    sourceManifestPath: files.sourceManifest,
    sanitizedOut: files.sanitizedOut,
    localReceiptOut: files.localReceiptOut,
    statePath: files.statePath,
    excludeSourceSegments: [],
    dryRun: !execute,
    execute,
    maxFailures: 3,
  };
}

describe('onedrive-pilot-write-runner', () => {
  it('requires exactly one execution mode', () => {
    expect(() => parsePilotWriteArgs([])).toThrow(/exactly one/);
    expect(() => parsePilotWriteArgs(['--dry-run', '--execute'])).toThrow(/exactly one/);
  });

  it('validates target UUIDs before allowing a pilot write dry-run', async () => {
    const files = await fixtureFiles({ targetOverride: { matter_id: 'PENDING_LOCAL_UUID' } });
    const report = await runPilotWrite(args(files));

    expect(report.gate_status).toBe('blocked');
    expect(report.target_blockers).toContain('target_matter_id_missing_or_invalid');
    expect(report.summary.status_counts.blocked).toBe(1);
  });

  it('passes dry-run without downloading source objects or writing Vault records', async () => {
    const files = await fixtureFiles();
    const downloadSourceObject = vi.fn();
    const uploadOne = vi.fn();

    const report = await runPilotWrite(args(files), { downloadSourceObject, uploadOne });

    expect(report.gate_status).toBe('pass');
    expect(report.execution_boundary).toBe('dry_run_no_vault_write');
    expect(report.summary.status_counts.ready).toBe(1);
    expect(downloadSourceObject).not.toHaveBeenCalled();
    expect(uploadOne).not.toHaveBeenCalled();
  });

  it('executes one ready item through the injected upload surface without leaking source labels', async () => {
    const files = await fixtureFiles();
    const downloadSourceObject = vi.fn(async (input: { destinationPath: string }) => {
      await writeFile(input.destinationPath, Buffer.from('hello world!'));
    });
    const uploadOne = vi.fn(async (_input: UploadedFieldsProbe) => ({
      documentId: '22222222-2222-4222-8222-222222222222',
      matterId,
      fileObjectId: '33333333-3333-4333-8333-333333333333',
    }));

    const report = await runPilotWrite(args(files, true), { downloadSourceObject, uploadOne });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.imported).toBe(1);
    expect(downloadSourceObject).toHaveBeenCalledOnce();
    expect(uploadOne).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ tenantId, matterId, actorUserId }),
        fields: expect.objectContaining({
          duplicateDecision: 'new_document',
        }),
      }),
    );
    const [uploadInput] = uploadOne.mock.calls[0] ?? [];
    expect(uploadInput?.fields).not.toHaveProperty('uploadPreflightRef');
    expect(serialized.includes('Client Alpha')).toBe(false);
    expect(serialized.includes('Matter One')).toBe(false);
    expect(serialized.includes('secret.docx')).toBe(false);
    expect(serialized.includes('raw-bucket')).toBe(false);
  });

  it('skips configured source folder segments without leaking excluded labels', async () => {
    const excludedSegment = '999_이전 자료들';
    const decomposedSegment = excludedSegment.normalize('NFD');
    const files = await fixtureFiles({
      sourceKey: `provider-root/${decomposedSegment}/secret.docx`,
    });
    const report = await runPilotWrite({
      ...args(files),
      excludeSourceSegments: [excludedSegment],
    });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.skipped).toBe(1);
    expect(report.summary.reason_counts.excluded_source_segment_policy).toBe(1);
    expect(serialized.includes(excludedSegment)).toBe(false);
    expect(serialized.includes(decomposedSegment)).toBe(false);
    expect(serialized.includes('secret.docx')).toBe(false);
    expect(serialized.includes('raw-bucket')).toBe(false);
  });
});
