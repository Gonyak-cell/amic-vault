import { Injectable } from '@nestjs/common';
import {
  auditMetadataKeys,
  type AuditMetadata,
  type AuditMetadataKey,
  type AuditMetadataValue,
} from '@amic-vault/shared';

const metadataKeySet = new Set<string>(auditMetadataKeys);

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
  if (key === 'diff_keys' && Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) {
        throw new Error('audit diff_keys entries must be bounded field names');
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
