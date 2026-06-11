export interface StorageObjectIds {
  tenantId: string;
  matterId: string;
  documentId: string;
  fileObjectId: string;
}

export interface ParsedStorageObjectKey extends StorageObjectIds {
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
    if (parts.length !== 7 || parts[0] !== 'tenants' || parts[2] !== 'matters' || parts[4] !== 'documents') {
      throw new StoragePathViolationError();
    }

    const parsed = {
      tenantId: assertUuid('tenantId', parts[1] ?? ''),
      matterId: assertUuid('matterId', parts[3] ?? ''),
      documentId: assertUuid('documentId', parts[5] ?? ''),
      fileObjectId: assertUuid('fileObjectId', parts[6] ?? ''),
      key: decoded,
    };
    return parsed;
  }

  assertTenantKey(tenantId: string, key: string): ParsedStorageObjectKey {
    const parsed = this.parseObjectKey(key);
    if (parsed.tenantId !== assertUuid('tenantId', tenantId)) {
      throw new StorageTenantIsolationViolationError();
    }
    return parsed;
  }

  assertTenantStorageUri(tenantId: string, uri: string): ParsedStorageObjectKey {
    const parsed = this.parseStorageUri(uri);
    if (parsed.tenantId !== assertUuid('tenantId', tenantId)) {
      throw new StorageTenantIsolationViolationError();
    }
    return parsed;
  }
}
