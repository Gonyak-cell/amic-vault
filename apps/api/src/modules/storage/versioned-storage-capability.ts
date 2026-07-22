import {
  StorageUnavailableError,
  StorageVersioningUnsupportedError,
  type StorageAdapter,
  type StorageVersionedObjectMetadata,
  type VersionedStorageAdapter,
} from './storage-adapter.interface';

export interface VersionedStorageCapabilityAdapter extends StorageAdapter, VersionedStorageAdapter {}

export type VersionedStorageCapabilityResult =
  | {
      status: 'SUPPORTED';
      exactInventory: true;
      exactHead: true;
      exactDelete: true;
      readbackAbsent: true;
      deleteMarker: true;
      wrongVersionDenied: true;
      crossTenantKeyDenied: true;
    }
  | {
      status: 'UNSUPPORTED' | 'AMBIGUOUS';
      reason: 'VERSIONING_DISABLED' | 'NULL_VERSION' | 'STORAGE_UNAVAILABLE';
    };

export interface ProbeVersionedStorageCapabilityInput {
  key: string;
  crossTenantKey: string;
}

type CapabilityFailureReason = 'VERSIONING_DISABLED' | 'NULL_VERSION' | 'STORAGE_UNAVAILABLE';

function selectSingleVersion(
  versions: readonly StorageVersionedObjectMetadata[],
): StorageVersionedObjectMetadata | undefined {
  return versions.find((version) => !version.isDeleteMarker && version.isLatest);
}

function selectDeleteMarker(
  versions: readonly StorageVersionedObjectMetadata[],
): StorageVersionedObjectMetadata | undefined {
  return versions.find((version) => version.isDeleteMarker && version.isLatest);
}

function unsupported(reason: CapabilityFailureReason): VersionedStorageCapabilityResult {
  return { status: 'UNSUPPORTED', reason };
}

/**
 * Proves only an isolated, synthetic object-version capability. It never
 * creates an application disposal record or accepts a caller-provided version.
 */
export async function probeVersionedStorageCapability(
  adapter: VersionedStorageCapabilityAdapter,
  input: ProbeVersionedStorageCapabilityInput,
): Promise<VersionedStorageCapabilityResult> {
  try {
    if (await adapter.head(input.key)) return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };

    await adapter.putIfAbsent({
      key: input.key,
      body: Buffer.from('synthetic-disposal-capability'),
      contentLength: 29,
      contentType: 'application/octet-stream',
    });

    const initialVersion = selectSingleVersion(await adapter.listObjectVersions(input.key));
    if (!initialVersion) return unsupported('NULL_VERSION');

    if (!(await adapter.headObjectVersion({ key: input.key, version: initialVersion.version }))) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }

    if (
      await adapter.headObjectVersion({
        key: input.crossTenantKey,
        version: initialVersion.version,
      })
    ) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }

    // This produces a synthetic delete marker. It is never a Records disposal operation.
    await adapter.delete(input.key);
    const deleteMarker = selectDeleteMarker(await adapter.listObjectVersions(input.key));
    if (!deleteMarker || (await adapter.head(input.key)) !== null) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }

    if (!(await adapter.headObjectVersion({ key: input.key, version: initialVersion.version }))) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }

    await adapter.deleteObjectVersion({ key: input.key, version: deleteMarker.version });
    if (!(await adapter.head(input.key))) return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };

    await adapter.deleteObjectVersion({ key: input.key, version: initialVersion.version });
    const deletedReadback = await adapter.headObjectVersion({
      key: input.key,
      version: initialVersion.version,
    });
    const deletedMarkerReadback = await adapter.headObjectVersion({
      key: input.key,
      version: deleteMarker.version,
    });
    if (deletedReadback || deletedMarkerReadback || (await adapter.head(input.key))) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }

    return {
      status: 'SUPPORTED',
      exactInventory: true,
      exactHead: true,
      exactDelete: true,
      readbackAbsent: true,
      deleteMarker: true,
      wrongVersionDenied: true,
      crossTenantKeyDenied: true,
    };
  } catch (error) {
    if (error instanceof StorageVersioningUnsupportedError) {
      return unsupported('VERSIONING_DISABLED');
    }
    if (error instanceof StorageUnavailableError) {
      return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
    }
    return { status: 'AMBIGUOUS', reason: 'STORAGE_UNAVAILABLE' };
  }
}
