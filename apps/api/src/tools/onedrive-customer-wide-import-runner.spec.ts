import crypto from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseCustomerWideImportArgs,
  runCustomerWideImport,
  type CustomerWideImportCliArgs,
} from './onedrive-customer-wide-import-runner';

type UploadedFieldsProbe = { fields: Record<string, unknown> };

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '11111111-1111-4111-8111-1111111111c1';
const matterId = '11111111-1111-4111-8111-111111111122';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const importApprovalRef = 'approval-ingest.sanitized.json';
const productionImportApprovalRef = 'APPROVAL-ONEDRIVE-PROD-PILOT-IMPORT-2026-06-29';
const uploadPreflightRef = 'upload-preflight-ref';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fixtureFiles(
  options: { cutoverPolicy?: string | undefined; extension?: string | undefined } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'onedrive-customer-wide-import-runner-test-'));
  const manifest = path.join(dir, 'resolved.ndjson');
  const scope = path.join(dir, 'scope.ndjson');
  const sanitizedOut = path.join(dir, 'sanitized.json');
  const localReceiptOut = path.join(dir, 'receipt.local.ndjson');
  const statePath = path.join(dir, 'state.local.json');
  const extension = options.extension ?? '.docx';
  const key = `provider-root/Client Alpha/Matter One/secret${extension}`;
  const sourceHash = sha256(key);
  await writeFile(
    manifest,
    `${JSON.stringify({
      migration_run_id: 'run-1',
      source_row_hash: sourceHash,
      tenant_id: tenantId,
      client_id: clientId,
      matter_id: matterId,
      matter_code: 'Alpha/Civil/계약분쟁',
      matter_code_hash: sha256('Alpha/Civil/계약분쟁'),
      mapping_candidate_hash: sha256('candidate-1'),
      approval_ref: importApprovalRef,
      source_lane: 'onedrive_approved_import_scope',
      planned_action: 'create_document_version_file_object_audit',
      idempotency_key: sha256('item-1'),
    })}\n`,
    'utf8',
  );
  await writeFile(
    scope,
    `${JSON.stringify({
      source_object_hash: sourceHash,
      extension,
      size_bytes: 12,
      raw: {
        bucket: 'raw-bucket',
        key,
      },
    })}\n`,
    'utf8',
  );
  return {
    manifest,
    scope,
    sanitizedOut,
    localReceiptOut,
    statePath,
    cutoverPolicy: options.cutoverPolicy ?? 'not_requested',
  };
}

function args(files: Awaited<ReturnType<typeof fixtureFiles>>, execute = false): CustomerWideImportCliArgs {
  return {
    runId: 'run-a',
    manifestPath: files.manifest,
    scopePath: files.scope,
    tenantSlug: 'tenant-alpha',
    actorUserId,
    uploadPreflightRef,
    importApprovalRef,
    manifestApprovalRef: importApprovalRef,
    sanitizedOut: files.sanitizedOut,
    localReceiptOut: files.localReceiptOut,
    statePath: files.statePath,
    dryRun: !execute,
    execute,
    offset: 0,
    maxFailures: 3,
    cutoverPolicy: files.cutoverPolicy,
    documentDefaults: {
      documentType: 'other',
      confidentialityLevel: 'standard',
      privilegeStatus: 'none',
      aiAllowed: false,
    },
  };
}

describe('onedrive-customer-wide-import-runner', () => {
  it('requires exactly one execution mode', () => {
    expect(() => parseCustomerWideImportArgs([])).toThrow(/exactly one/);
    expect(() => parseCustomerWideImportArgs(['--dry-run', '--execute'])).toThrow(/exactly one/);
  });

  it('passes dry-run without downloading source objects or writing Vault records', async () => {
    const files = await fixtureFiles();
    const downloadSourceObject = vi.fn();
    const uploadOne = vi.fn();

    const report = await runCustomerWideImport(args(files), { downloadSourceObject, uploadOne });

    expect(report.gate_status).toBe('pass');
    expect(report.execution_boundary).toBe('dry_run_no_vault_write');
    expect(report.summary.status_counts.ready).toBe(1);
    expect(downloadSourceObject).not.toHaveBeenCalled();
    expect(uploadOne).not.toHaveBeenCalled();
  });

  it('treats all approved OneDrive migration extensions as import-ready', async () => {
    for (const extension of [
      '.pdf',
      '.docx',
      '.jpg',
      '.xlsx',
      '.png',
      '.txt',
      '.eml',
      '.doc',
      '.xls',
      '.hwp',
      '.pptx',
      '.jpeg',
      '.csv',
      '.msg',
      '.hwpx',
      '.ppt',
    ]) {
      const files = await fixtureFiles({ extension });
      const report = await runCustomerWideImport(args(files), {
        downloadSourceObject: vi.fn(),
        uploadOne: vi.fn(),
      });

      expect(report.gate_status).toBe('pass');
      expect(report.summary.status_counts.ready).toBe(1);
      expect(report.summary.reason_counts.ready_for_customer_wide_import).toBe(1);
      expect(report.summary.reason_counts[`unsupported_extension_${extension}`]).toBeUndefined();
    }
  });

  it('separates production import approval from manifest approval provenance', async () => {
    const files = await fixtureFiles();
    const report = await runCustomerWideImport({
      ...args(files),
      importApprovalRef: productionImportApprovalRef,
      manifestApprovalRef: importApprovalRef,
    });

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.ready).toBe(1);
    expect(report.summary.reason_counts.approval_ref_mismatch).toBeUndefined();
    expect(report.approval_refs).toMatchObject({
      import_and_manifest_approval_refs_match: false,
    });
  });

  it('executes through the injected upload surface without leaking source labels', async () => {
    const files = await fixtureFiles();
    const downloadSourceObject = vi.fn(async (input: { destinationPath: string }) => {
      await writeFile(input.destinationPath, Buffer.from('hello world!'));
    });
    const uploadOne = vi.fn(async (input: UploadedFieldsProbe) => {
      expect(input.fields).toMatchObject({
        duplicateDecision: 'new_document',
        uploadPreflightRef,
      });
      return {
        documentId: '22222222-2222-4222-8222-222222222222',
        matterId,
        fileObjectId: '33333333-3333-4333-8333-333333333333',
      };
    });

    const report = await runCustomerWideImport(args(files, true), {
      downloadSourceObject,
      uploadOne,
    });
    const serialized = await readFile(files.sanitizedOut, 'utf8');

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.imported).toBe(1);
    expect(downloadSourceObject).toHaveBeenCalledOnce();
    expect(uploadOne).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ tenantId, matterId, clientId }),
        tenantSlug: 'tenant-alpha',
        actorUserId,
      }),
    );
    expect(serialized.includes('Client Alpha')).toBe(false);
    expect(serialized.includes('Matter One')).toBe(false);
    expect(serialized.includes('secret.docx')).toBe(false);
    expect(serialized.includes('raw-bucket')).toBe(false);
  });

  it('refuses bundled source-of-truth cutover', async () => {
    const files = await fixtureFiles({ cutoverPolicy: 'execute_after_import' });
    const report = await runCustomerWideImport(args(files));

    expect(report.gate_status).toBe('blocked');
    expect(report.global_blockers).toContain('source_of_truth_cutover_must_not_be_requested');
    expect(report.summary.status_counts.blocked).toBe(1);
  });

  it('replays idempotently from the local state file', async () => {
    const files = await fixtureFiles();
    await writeFile(
      files.statePath,
      `${JSON.stringify({
        imported: {
          [sha256('item-1')]: {
            documentId: '22222222-2222-4222-8222-222222222222',
            matterId,
            fileObjectId: '33333333-3333-4333-8333-333333333333',
          },
        },
      })}\n`,
      'utf8',
    );

    const report = await runCustomerWideImport(args(files, true), {
      downloadSourceObject: vi.fn(),
      uploadOne: vi.fn(),
    });

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.already_imported).toBe(1);
    expect(report.local_receipt_rows_written).toBe(0);
  });

  it('reports already-imported rows during dry-run replay', async () => {
    const files = await fixtureFiles();
    await writeFile(
      files.statePath,
      `${JSON.stringify({
        imported: {
          [sha256('item-1')]: {
            documentId: '22222222-2222-4222-8222-222222222222',
            matterId,
            fileObjectId: '33333333-3333-4333-8333-333333333333',
          },
        },
      })}\n`,
      'utf8',
    );

    const report = await runCustomerWideImport(args(files), {
      downloadSourceObject: vi.fn(),
      uploadOne: vi.fn(),
    });

    expect(report.gate_status).toBe('pass');
    expect(report.summary.status_counts.already_imported).toBe(1);
    expect(report.summary.status_counts.ready).toBeUndefined();
    expect(report.local_receipt_rows_written).toBe(0);
  });

  it('records unsupported upload validation as a replayable skip', async () => {
    const files = await fixtureFiles({ extension: '.jpg' });
    const downloadSourceObject = vi.fn(async (input: { destinationPath: string }) => {
      await writeFile(input.destinationPath, Buffer.from('not-a-jpeg!!'));
    });
    const uploadOne = vi.fn(async () => {
      const error = new Error('unsupported');
      Object.assign(error, { response: { code: 'UNSUPPORTED_FILE_TYPE' } });
      throw error;
    });

    const executeReport = await runCustomerWideImport(args(files, true), {
      downloadSourceObject,
      uploadOne,
    });
    const savedState = JSON.parse(await readFile(files.statePath, 'utf8')) as {
      skipped?: Record<string, { reason?: string }>;
    };

    expect(executeReport.gate_status).toBe('pass');
    expect(executeReport.summary.status_counts.skipped).toBe(1);
    expect(executeReport.summary.reason_counts.unsupported_upload_validation_skip_with_receipt).toBe(1);
    expect(Object.values(savedState.skipped ?? {})[0]?.reason).toBe(
      'unsupported_upload_validation_skip_with_receipt',
    );

    const replayReport = await runCustomerWideImport(args(files), {
      downloadSourceObject: vi.fn(),
      uploadOne: vi.fn(),
    });

    expect(replayReport.gate_status).toBe('pass');
    expect(replayReport.summary.status_counts.skipped).toBe(1);
    expect(replayReport.summary.status_counts.ready).toBeUndefined();
  });
});
