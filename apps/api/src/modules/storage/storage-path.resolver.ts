export interface StorageObjectIds {
  tenantId: string;
  matterId: string;
  documentId: string;
  fileObjectId: string;
}

export interface EmailRawStorageObjectIds {
  tenantId: string;
  emailId: string;
  fileObjectId: string;
}

export interface AuditAnchorStorageObjectIds {
  tenantId: string;
  anchorDate: string;
}

export interface QuarantineStorageObjectIds {
  tenantId: string;
  quarantineRef: string;
}

export type ParsedStorageObjectKey =
  | (StorageObjectIds & {
      objectType: 'document';
      key: string;
    })
  | (EmailRawStorageObjectIds & {
      objectType: 'email_raw';
      key: string;
    })
  | (AuditAnchorStorageObjectIds & {
      objectType: 'audit_anchor';
      key: string;
    })
  | {
      objectType: 'quarantine';
      tenantId: string;
      quarantineRef: string;
      key: string;
    };

interface ParsedStorageObjectKeyBase {
  tenantId: string;
  key: string;
}

export class StoragePathViolationError extends Error {
  constructor(message = 'invalid storage path') {
    super(message);
    this.name = 'StoragePathViolationError';
  }
}

export class StorageTenantIsolationViolationError extends Error {
  constructor() {
    super('storage tenant prefix mismatch');
    this.name = 'StorageTenantIsolationViolationError';
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertUuid(name: string, value: string): string {
  if (!uuidPattern.test(value)) {
    throw new StoragePathViolationError(`${name}: invalid uuid`);
  }
  return value.toLowerCase();
}

function hasTraversal(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('..') || lower.includes('%2e') || lower.includes('\\');
}

export class StoragePathResolver {
  constructor(private readonly bucket = process.env.S3_BUCKET ?? 'amic-vault-dev') {}

  buildObjectKey(input: StorageObjectIds): string {
    const tenantId = assertUuid('tenantId', input.tenantId);
    const matterId = assertUuid('matterId', input.matterId);
    const documentId = assertUuid('documentId', input.documentId);
    const fileObjectId = assertUuid('fileObjectId', input.fileObjectId);
    return `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;
  }

  buildEmailRawObjectKey(input: EmailRawStorageObjectIds): string {
    const tenantId = assertUuid('tenantId', input.tenantId);
    const emailId = assertUuid('emailId', input.emailId);
    const fileObjectId = assertUuid('fileObjectId', input.fileObjectId);
    return `tenants/${tenantId}/emails/${emailId}/raw/${fileObjectId}`;
  }

  buildAuditAnchorObjectKey(input: AuditAnchorStorageObjectIds): string {
    const tenantId = assertUuid('tenantId', input.tenantId);
    if (!utcDatePattern.test(input.anchorDate)) {
      throw new StoragePathViolationError('anchorDate: invalid utc date');
    }
    return `tenants/${tenantId}/audit-anchors/${input.anchorDate}.json`;
  }

  buildQuarantineObjectKey(input: QuarantineStorageObjectIds): string {
    const tenantId = assertUuid('tenantId', input.tenantId);
    const quarantineRef = assertUuid('quarantineRef', input.quarantineRef);
    return `tenants/${tenantId}/quarantine/${quarantineRef}`;
  }

  storageUriForKey(key: string): string {
    return `s3://${this.bucket}/${this.parseObjectKey(key).key}`;
  }

  parseStorageUri(uri: string): ParsedStorageObjectKey {
    const prefix = `s3://${this.bucket}/`;
    if (!uri.startsWith(prefix)) {
      throw new StoragePathViolationError('storage uri bucket mismatch');
    }
    return this.parseObjectKey(uri.slice(prefix.length));
  }

  parseObjectKey(key: string): ParsedStorageObjectKey {
    if (!key || hasTraversal(key)) {
      throw new StoragePathViolationError();
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(key);
    } catch {
      throw new StoragePathViolationError();
    }
    if (hasTraversal(decoded)) {
      throw new StoragePathViolationError();
    }

    const parts = decoded.split('/');
    if (parts[0] !== 'tenants') {
      throw new StoragePathViolationError();
    }

    if (parts.length === 7 && parts[2] === 'matters' && parts[4] === 'documents') {
      return {
        objectType: 'document',
        tenantId: assertUuid('tenantId', parts[1] ?? ''),
        matterId: assertUuid('matterId', parts[3] ?? ''),
        documentId: assertUuid('documentId', parts[5] ?? ''),
        fileObjectId: assertUuid('fileObjectId', parts[6] ?? ''),
        key: decoded,
      };
    }

    if (parts.length === 6 && parts[2] === 'emails' && parts[4] === 'raw') {
      return {
        objectType: 'email_raw',
        tenantId: assertUuid('tenantId', parts[1] ?? ''),
        emailId: assertUuid('emailId', parts[3] ?? ''),
        fileObjectId: assertUuid('fileObjectId', parts[5] ?? ''),
        key: decoded,
      };
    }

    if (parts.length === 4 && parts[2] === 'audit-anchors') {
      const fileName = parts[3] ?? '';
      const anchorDate = fileName.endsWith('.json') ? fileName.slice(0, -5) : '';
      if (!utcDatePattern.test(anchorDate)) {
        throw new StoragePathViolationError('anchorDate: invalid utc date');
      }
      return {
        objectType: 'audit_anchor',
        tenantId: assertUuid('tenantId', parts[1] ?? ''),
        anchorDate,
        key: decoded,
      };
    }

    if (parts.length === 4 && parts[2] === 'quarantine') {
      return {
        objectType: 'quarantine',
        tenantId: assertUuid('tenantId', parts[1] ?? ''),
        quarantineRef: assertUuid('quarantineRef', parts[3] ?? ''),
        key: decoded,
      };
    }

    throw new StoragePathViolationError();
  }

  assertTenantKey(tenantId: string, key: string): ParsedStorageObjectKeyBase {
    const parsed = this.parseObjectKey(key);
    if (parsed.tenantId !== assertUuid('tenantId', tenantId)) {
      throw new StorageTenantIsolationViolationError();
    }
    return parsed;
  }

  assertTenantStorageUri(tenantId: string, uri: string): ParsedStorageObjectKeyBase {
    const parsed = this.parseStorageUri(uri);
    if (parsed.tenantId !== assertUuid('tenantId', tenantId)) {
      throw new StorageTenantIsolationViolationError();
    }
    return parsed;
  }
}
