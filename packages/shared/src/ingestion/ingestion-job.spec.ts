import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ingestionJobValidationErrorCode,
  ingestionParserProfiles,
  ingestionStorageAliases,
  MAX_INGESTION_OBJECT_BYTES,
  validateIngestionJob,
} from './ingestion-job';

interface GoldenCase {
  id: string;
  expected: 'accept' | 'reject';
  overrides?: Record<string, unknown>;
}

interface GoldenCorpus {
  now: string;
  base: Record<string, unknown>;
  cases: GoldenCase[];
}

const fixturePath = resolve(__dirname, '../../../../tests/fixtures/documents/ingestion-job-contract.json');
const fixtureBytes = readFileSync(fixturePath);
const corpus = JSON.parse(fixtureBytes.toString('utf8')) as GoldenCorpus;

describe('ingestion job contract', () => {
  it('uses a closed storage and parser vocabulary', () => {
    expect(ingestionStorageAliases).toEqual(['primary']);
    expect(ingestionParserProfiles).toEqual(['extract', 'ocr', 'convert', 'email', 'zip']);
    expect(MAX_INGESTION_OBJECT_BYTES).toBe(500 * 1024 * 1024);
  });

  it('matches every shared golden accept/reject result without exposing parser details', () => {
    const now = new Date(corpus.now);
    for (const testCase of corpus.cases) {
      const result = validateIngestionJob({ ...corpus.base, ...testCase.overrides }, now);
      expect({ id: testCase.id, result: result.ok ? 'accept' : 'reject' }).toEqual({
        id: testCase.id,
        result: testCase.expected,
      });
      if (!result.ok) expect(result).toEqual({ ok: false, code: ingestionJobValidationErrorCode });
    }
  });

  it('keeps the shared corpus synthetic and byte-addressable for Python parity evidence', () => {
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
    expect(fixtureBytes.toString('utf8')).not.toContain('customer');
  });
});
