import { describe, expect, it } from 'vitest';
import { parseFilenameMetadata } from './filename-metadata.parser';

describe('parseFilenameMetadata', () => {
  it('suggests type, date, and version without making authoritative changes', () => {
    expect(parseFilenameMetadata('2026.06.12_계약서_v3.pdf')).toEqual({
      documentType: 'contract',
      date: '2026-06-12',
      versionLabel: 'v3',
    });
  });

  it('suggests decimal version labels and final significance from Korean filenames', () => {
    expect(parseFilenameMetadata('계약서_v2.1_최종.docx')).toEqual({
      documentType: 'contract',
      versionLabel: 'v2.1',
      versionSignificance: 'final',
    });
  });

  it('returns an empty suggestion when no bounded pattern matches', () => {
    expect(parseFilenameMetadata('random-upload.pdf')).toEqual({});
  });
});
