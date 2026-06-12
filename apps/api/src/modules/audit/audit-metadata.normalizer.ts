import { Injectable } from '@nestjs/common';
import {
  auditMetadataKeys,
  type AuditMetadata,
  type AuditMetadataKey,
  type AuditMetadataValue,
} from '@amic-vault/shared';

const metadataKeySet = new Set<string>(auditMetadataKeys);
const stringListMetadataKeys = new Set<AuditMetadataKey>([
  'diff_keys',
  'included_chunk_ids',
  'excluded_chunk_ids',
  'error_types',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeScalar(key: AuditMetadataKey, value: unknown): AuditMetadataValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (value.length > 256) {
      throw new Error(`audit metadata value too long: ${key}`);
    }
    return value;
  }
  if (Array.isArray(value) && stringListMetadataKeys.has(key)) {
    if (value.length > 200) {
      throw new Error(`audit metadata list too long: ${key}`);
    }
    return value.map((entry) => {
      if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) {
        throw new Error(`audit ${key} entries must be bounded references`);
      }
      return entry;
    });
  }
  throw new Error(`audit metadata value is not allowed: ${key}`);
}

@Injectable()
export class AuditMetadataNormalizer {
  normalize(input: unknown): AuditMetadata {
    if (input === undefined || input === null) return {};
    if (!isPlainRecord(input)) {
      throw new Error('audit metadata must be an object');
    }

    const output: AuditMetadata = {};
    for (const [key, value] of Object.entries(input)) {
      if (!metadataKeySet.has(key)) continue;
      output[key as AuditMetadataKey] = normalizeScalar(key as AuditMetadataKey, value);
    }
    return output;
  }
}
