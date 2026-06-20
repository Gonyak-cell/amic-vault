import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission } from '@amic-vault/shared';
import { DocumentUploadService, type UploadedDiskFile } from './document-upload.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

async function tempUploadFile(
  name: string,
  content = '%PDF-1.7 content',
): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-upload-test-'));
  const path = join(dir, name);
  await writeFile(path, content);
  return {
    path,
    originalname: name,
    mimetype: 'application/pdf',
    size: Buffer.byteLength(content),
  };
}

async function drainBody(body: Buffer | Readable): Promise<void> {
  if (Buffer.isBuffer(body)) return;
  let bytes = 0;
  for await (const chunk of body) {
    bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    // Consume the test stream so the service can safely unlink the temp file.
  }
  expect(bytes).toBeGreaterThanOrEqual(0);
}

function createService(
  options: {
    duplicateUploadCandidates?: Array<{
      documentReference: string;
      matterCode: string | null;
      matterName: string | null;
      title: string;
      versionLabel: string;
    }>;
    matterSourcePolicy?: 'allow' | 'block';
    permission?: 'allow' | 'deny' | 'wall';
    versionDuplicateCandidates?: Array<{
      documentId: string;
      fileObjectId: string;
      sha256: string;
    }>;
  } = {},
) {
  const permission =
    options.permission === 'deny'
      ? denyPermission('PERMISSION_DENIED')
      : options.permission === 'wall'
        ? denyPermission('ETHICAL_WALL_BLOCKED')
        : allowPermission();
  const transaction = vi.fn(async (_tenantId: string, run: (tx: never) => Promise<void>) =>
    run({} as never),
  );
  const auditLog = vi.fn(async () => undefined);
  const createDraft = vi.fn(async () => ({
    documentId: 'generated-document-id',
    tenantId,
    matterId,
    documentFamilyId: 'generated-document-id',
    title: 'Contract',
    status: 'draft' as const,
    documentType: 'contract' as const,
    subtype: 'signed',
    confidentialityLevel: 'high' as const,
    privilegeStatus: 'privileged' as const,
    aiAllowed: false,
    legalHold: false,
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const createFileObject = vi.fn(async () => ({
    fileObjectId: 'generated-file-object-id',
    tenantId,
    storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/generated-document-id/generated-file-object-id`,
    originalFilename: 'Contract.pdf',
    normalizedFilename: 'Contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 7,
    sha256: 'd'.repeat(64),
    encryptionKeyId: null,
    sourceSystem: 'upload' as const,
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
  }));
  const createInitialVersion = vi.fn(async () => ({
    versionId: 'generated-version-id',
    documentId: 'generated-document-id',
    versionNo: 1,
    versionStatus: 'current' as const,
    fileObjectId: 'generated-file-object-id',
    fileHash: 'd'.repeat(64),
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
    supersedesVersionId: null,
  }));
  const findVersionTarget = vi.fn(async () => ({
    document_id: 'existing-document-id',
    tenant_id: tenantId,
    matter_id: matterId,
    document_family_id: 'existing-document-family-id',
    status: 'draft' as const,
    matter_status: 'active',
  }));
  const addNextVersion = vi.fn(async () => ({
    versionId: 'generated-version-id-v2',
    documentId: 'existing-document-id',
    versionNo: 2,
    versionStatus: 'current' as const,
    fileObjectId: 'generated-file-object-id-v2',
    fileHash: 'd'.repeat(64),
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
    supersedesVersionId: 'generated-version-id',
  }));
  const findDuplicateVersionCandidates = vi.fn(
    async () => options.versionDuplicateCandidates ?? [],
  );
  const findCandidates = vi.fn(async () => []);
  const findSafeUploadCandidates = vi.fn(async () => options.duplicateUploadCandidates ?? []);
  const putTenantObject = vi.fn(
    async (input: { fileObjectId: string; documentId: string; body: Buffer | Readable }) => {
      await drainBody(input.body);
      return {
        key: `tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        encryptionKeyId: null,
      };
    },
  );
  const matterSourcePolicy =
    options.matterSourcePolicy === undefined
      ? undefined
      : {
          assertUploadMutationAllowed:
            options.matterSourcePolicy === 'block'
              ? vi.fn(async () => {
                  throw new BadRequestException({
                    code: 'VALIDATION_FAILED',
                    reason: 'MATTER_SOURCE_UNAVAILABLE',
                  });
                })
              : vi.fn(async () => ({
                  decisionRef: 'matter-source-mutation:decision',
                  matterId,
                  permissionDecisionRef: 'matter-upload-permission:decision',
                  preflightRef: 'upf_ref',
                  preflightExpiresAt: '2026-06-20T00:05:00.000Z',
                  sourceMode: 'matter_app_api',
                  sourceRevision: 'source-rev-1',
                  sourceUpdatedAt: '2026-06-20T00:00:00.000Z',
                })),
        };
  const service = new DocumentUploadService(
    { transaction, log: auditLog } as never,
    { createDraft } as never,
    {
      createInitialVersion,
      findVersionTarget,
      addNextVersion,
      findDuplicateVersionCandidates,
    } as never,
    { findCandidates, findSafeUploadCandidates } as never,
    { create: createFileObject } as never,
    { canUploadToMatter: vi.fn(async () => permission) } as never,
    { putTenantObject, deleteByStorageUri: vi.fn(async () => undefined) } as never,
    {
      require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
    } as never,
    matterSourcePolicy as never,
  );
  return {
    auditLog,
    createDraft,
    createFileObject,
    createInitialVersion,
    findCandidates,
    findDuplicateVersionCandidates,
    findSafeUploadCandidates,
    findVersionTarget,
    matterSourcePolicy,
    putTenantObject,
    service,
  };
}

describe('DocumentUploadService', () => {
  it('creates storage object, document row, and file object row for allowed members', async () => {
    const file = await tempUploadFile('Contract.PDF');
    const { createDraft, createFileObject, createInitialVersion, putTenantObject, service } =
      createService();

    const response = await service.upload({
      actorUserId,
      matterId,
      fields: {},
      file,
    });

    expect(response.status).toBe('draft');
    expect(response.title).toBe('Contract');
    expect(response.documentType).toBe('contract');
    expect(response.subtype).toBe('signed');
    expect(response.confidentialityLevel).toBe('high');
    expect(response.privilegeStatus).toBe('privileged');
    expect(response.metadataSuggestion).toEqual({ documentType: 'contract' });
    expect(response.duplicates).toEqual([]);
    expect(putTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, matterId, contentType: 'application/pdf' }),
    );
    expect(createDraft).toHaveBeenCalledOnce();
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: undefined,
        subtype: undefined,
        confidentialityLevel: undefined,
        privilegeStatus: undefined,
        aiAllowed: undefined,
      }),
      expect.anything(),
    );
    expect(createFileObject).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/pdf',
        sourceSystem: 'upload',
        sha256: 'd274f10f823f4da5c383bedc6bf03b4aed26b05f8306cf082b8402ae78a456a5',
      }),
      expect.anything(),
    );
    expect(createInitialVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: expect.any(String),
        fileObjectId: expect.any(String),
        fileHash: 'd274f10f823f4da5c383bedc6bf03b4aed26b05f8306cf082b8402ae78a456a5',
      }),
      expect.anything(),
    );
  });

  it('accepts explicit metadata fields and only suggests parsed filename metadata', async () => {
    const file = await tempUploadFile('2026-06-12_계약서_v2.pdf');
    const { createDraft, service } = createService();

    const response = await service.upload({
      actorUserId,
      matterId,
      fields: {
        documentType: 'memo',
        subtype: 'review',
        confidentialityLevel: 'restricted',
        privilegeStatus: 'work_product',
      },
      file,
    });

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'memo',
        subtype: 'review',
        confidentialityLevel: 'restricted',
        privilegeStatus: 'work_product',
        aiAllowed: undefined,
      }),
      expect.anything(),
    );
    expect(response.metadataSuggestion).toEqual({
      documentType: 'contract',
      date: '2026-06-12',
      versionLabel: 'v2',
    });
  });

  it('passes explicit file organization prep consent into document creation', async () => {
    const file = await tempUploadFile('Contract.PDF');
    const { createDraft, service } = createService();

    await service.upload({
      actorUserId,
      matterId,
      fields: { aiAllowed: true },
      file,
    });

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        aiAllowed: true,
      }),
      expect.anything(),
    );
  });

  it('records Matter source decision refs when upload policy is satisfied', async () => {
    const file = await tempUploadFile('Contract.PDF');
    const { auditLog, matterSourcePolicy, service } = createService({
      matterSourcePolicy: 'allow',
    });

    await service.upload({
      actorUserId,
      matterId,
      fields: { uploadPreflightRef: 'upf_ref' },
      file,
    });

    expect(matterSourcePolicy?.assertUploadMutationAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        matterId,
        purpose: 'document_upload',
        uploadPreflightRef: 'upf_ref',
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_UPLOADED',
        metadata: expect.objectContaining({
          decision_ref: 'matter-source-mutation:decision',
          request_id: 'upf_ref',
          scope_id: 'matter_app_api',
          scope_type: 'matter_app_source',
        }),
      }),
      expect.anything(),
    );
  });

  it('fails closed before storage when Matter source policy blocks upload', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { putTenantObject, service } = createService({ matterSourcePolicy: 'block' });

    await expect(service.upload({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject(
      {
        response: { code: 'VALIDATION_FAILED' },
      },
    );
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('requires an explicit new-document decision before storing duplicate uploads', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { findSafeUploadCandidates, putTenantObject, service } = createService({
      duplicateUploadCandidates: [
        {
          documentReference: '11111111-1111-4111-8111-111111111123',
          matterCode: 'AMIC-2026-0001',
          matterName: 'Investment Advisory',
          title: 'Contract.pdf',
          versionLabel: 'v1 current',
        },
      ],
    });

    await expect(service.upload({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject(
      {
        response: { code: 'VALIDATION_FAILED', reason: 'DUPLICATE_DECISION_REQUIRED' },
      },
    );
    expect(findSafeUploadCandidates).toHaveBeenCalled();
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('records a duplicate new-document decision when the user keeps a separate document', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { auditLog, service } = createService({
      duplicateUploadCandidates: [
        {
          documentReference: '11111111-1111-4111-8111-111111111123',
          matterCode: 'AMIC-2026-0001',
          matterName: 'Investment Advisory',
          title: 'Contract.pdf',
          versionLabel: 'v1 current',
        },
      ],
    });

    await service.upload({
      actorUserId,
      matterId,
      fields: { duplicateDecision: 'new_document' },
      file,
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_UPLOADED',
        metadata: expect.objectContaining({
          reason_code: 'duplicate_new_document',
          result_count: 1,
        }),
      }),
      expect.anything(),
    );
  });

  it('rejects a new-version decision on the new document upload endpoint before storage', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { putTenantObject, service } = createService();

    await expect(
      service.upload({
        actorUserId,
        matterId,
        fields: { duplicateDecision: 'new_version' },
        file,
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'DUPLICATE_VERSION_ENDPOINT_REQUIRED' },
    });
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('uploads buffered email attachments through the same pipeline with email source', async () => {
    const { createFileObject, service } = createService();

    const response = await service.uploadBuffer({
      actorUserId,
      matterId,
      fields: { title: 'Attachment' },
      originalFilename: 'attachment.pdf',
      mimeType: 'application/pdf',
      body: Buffer.from('%PDF-1.7\nattachment\n%%EOF\n'),
      sourceSystem: 'email_ingest',
    });

    expect(response.documentId).toEqual(expect.any(String));
    expect(createFileObject).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: 'attachment.pdf',
        normalizedFilename: 'attachment.pdf',
        sourceSystem: 'email_ingest',
      }),
      expect.anything(),
    );
  });

  it('fails closed before storage when upload permission denies', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { putTenantObject, service } = createService({ permission: 'deny' });

    await expect(service.upload({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject(
      {
        response: { code: 'PERMISSION_DENIED' },
      },
    );
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('preserves ethical wall error codes without disclosing document details', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { service } = createService({ permission: 'wall' });

    await expect(service.upload({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject(
      {
        response: { code: 'ETHICAL_WALL_BLOCKED' },
      },
    );
  });

  it('requires an explicit new-version decision before storing duplicate version uploads', async () => {
    const file = await tempUploadFile('Contract-v2.pdf');
    const { putTenantObject, service } = createService({
      versionDuplicateCandidates: [
        {
          documentId: 'existing-document-id',
          fileObjectId: 'existing-file-object-id',
          sha256: 'd274f10f823f4da5c383bedc6bf03b4aed26b05f8306cf082b8402ae78a456a5',
        },
      ],
    });

    await expect(
      service.addVersion({
        actorUserId,
        documentId: 'existing-document-id',
        fields: {},
        file,
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', reason: 'DUPLICATE_DECISION_REQUIRED' },
    });
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('records a duplicate new-version decision when the user adds a version', async () => {
    const file = await tempUploadFile('Contract-v2.pdf');
    const { auditLog, service } = createService({
      versionDuplicateCandidates: [
        {
          documentId: 'existing-document-id',
          fileObjectId: 'existing-file-object-id',
          sha256: 'd274f10f823f4da5c383bedc6bf03b4aed26b05f8306cf082b8402ae78a456a5',
        },
      ],
    });

    await service.addVersion({
      actorUserId,
      documentId: 'existing-document-id',
      fields: { duplicateDecision: 'new_version' },
      file,
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_VERSION_ADDED',
        metadata: expect.objectContaining({
          reason_code: 'duplicate_new_version',
          result_count: 1,
        }),
      }),
      expect.anything(),
    );
  });
});
