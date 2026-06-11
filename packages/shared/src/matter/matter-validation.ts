import { z } from 'zod';

export const matterMetadataSchema = z
  .record(z.string().min(1).max(64), z.string().max(256))
  .default({});

export const matterOptionalDateSchema = z.string().datetime({ offset: true }).optional();

export function isMatterDateRangeValid(openedAt?: string, closedAt?: string): boolean {
  if (!openedAt || !closedAt) return true;
  return Date.parse(openedAt) <= Date.parse(closedAt);
}

export function containsSensitiveMatterMetadataKey(metadata: Record<string, string>): boolean {
  return Object.keys(metadata).some((key) =>
    ['body', 'content', 'text', 'snippet', 'raw', 'password', 'token'].includes(key),
  );
}
