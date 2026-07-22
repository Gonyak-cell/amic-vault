import { describe, expect, it } from 'vitest';
import {
  StorageVersioningUnsupportedError,
  type StorageGetObjectResult,
  type StorageObjectMetadata,
  type StorageObjectVersion,
  type StorageReadUrlResult,
} from './storage-adapter.interface';
import {
  probeVersionedStorageCapability,
  type VersionedStorageCapabilityAdapter,
} from './versioned-storage-capability';

const versionOne = {} as StorageObjectVersion;
const deleteMarker = {} as StorageObjectVersion;

class CapabilityAdapter implements VersionedStorageCapabilityAdapter {
  private objectPresent = false;
  private markerPresent = false;

  async putIfAbsent(): Promise<void> {
    this.objectPresent = true;
  }

  async get(): Promise<StorageGetObjectResult> {
    throw new Error('not used');
  }

  async getRange(): Promise<StorageGetObjectResult> {
    throw new Error('not used');
  }

  async createReadUrl(): Promise<StorageReadUrlResult> {
    throw new Error('not used');
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    if (key !== 'tenants/a/synthetic' || !this.objectPresent || this.markerPresent) return null;
    return { key, contentLength: 29, contentType: 'application/octet-stream', etag: null };
  }

  async delete(key: string): Promise<void> {
    if (key === 'tenants/a/synthetic') this.markerPresent = true;
  }

  async listObjectVersions(key: string) {
    if (key !== 'tenants/a/synthetic') return [];
    const versions = [];
    if (this.markerPresent) {
      versions.push({
        key,
        contentLength: 0,
        contentType: null,
        etag: null,
        version: deleteMarker,
        versionFingerprint: 'b'.repeat(64),
        isDeleteMarker: true,
        isLatest: true,
      });
    }
    if (this.objectPresent) {
      versions.push({
        key,
        contentLength: 29,
        contentType: 'application/octet-stream',
        etag: null,
        version: versionOne,
        versionFingerprint: 'a'.repeat(64),
        isDeleteMarker: false,
        isLatest: !this.markerPresent,
      });
    }
    return versions;
  }

  async headObjectVersion(input: { key: string; version: StorageObjectVersion }) {
    if (input.key !== 'tenants/a/synthetic') return null;
    if (input.version === versionOne && this.objectPresent) {
      return { key: input.key, contentLength: 29, contentType: 'application/octet-stream', etag: null };
    }
    return null;
  }

  async deleteObjectVersion(input: { key: string; version: StorageObjectVersion }): Promise<void> {
    if (input.key !== 'tenants/a/synthetic') throw new Error('unexpected key');
    if (input.version === deleteMarker) this.markerPresent = false;
    if (input.version === versionOne) this.objectPresent = false;
  }
}

class DisabledCapabilityAdapter extends CapabilityAdapter {
  override async listObjectVersions(): Promise<never> {
    throw new StorageVersioningUnsupportedError();
  }
}

describe('probeVersionedStorageCapability', () => {
  it('proves version inventory, delete-marker, exact delete and readback absence', async () => {
    await expect(
      probeVersionedStorageCapability(new CapabilityAdapter(), {
        key: 'tenants/a/synthetic',
        crossTenantKey: 'tenants/b/synthetic',
      }),
    ).resolves.toEqual({
      status: 'SUPPORTED',
      exactInventory: true,
      exactHead: true,
      exactDelete: true,
      readbackAbsent: true,
      deleteMarker: true,
      wrongVersionDenied: true,
      crossTenantKeyDenied: true,
    });
  });

  it('fails closed when object versioning is absent', async () => {
    await expect(
      probeVersionedStorageCapability(new DisabledCapabilityAdapter(), {
        key: 'tenants/a/synthetic',
        crossTenantKey: 'tenants/b/synthetic',
      }),
    ).resolves.toEqual({ status: 'UNSUPPORTED', reason: 'VERSIONING_DISABLED' });
  });
});
