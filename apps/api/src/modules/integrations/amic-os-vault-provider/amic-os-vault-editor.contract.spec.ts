import { describe, expect, it } from 'vitest';
import { documentCopyMimeTypes, parseAmicOsVaultDocumentCopyPrepareInput,
  parseAmicOsVaultDocumentCopyReadInput, parseAmicOsVaultOfficeCopyCreateInput } from './amic-os-vault-editor.contract';
const base = { principal: { tenant_id: 'synthetic-lawos', user_id: 'synthetic-user' }, lawos_matter_id: 'synthetic-matter',
  requested_exact_version: { document_id: '11111111-1111-4111-8111-111111111111',
    version_id: '22222222-2222-4222-8222-222222222222', file_object_id: '33333333-3333-4333-8333-333333333333',
    sha256: 'a'.repeat(64), byte_size: 25 * 1024 * 1024, mime_type: 'text/plain' },
  copy_id: 'document-copy:44444444-4444-4444-8444-444444444444',
  snapshot_id: 'document-copy-snapshot:55555555-5555-4555-8555-555555555555' };

describe('generic copy contracts preserve the Office engine boundary', () => {
  it('accepts exactly the thirteen preserved types at 25MiB', () => {
    expect(documentCopyMimeTypes.size).toBe(13);
    for (const mime_type of documentCopyMimeTypes) {
      expect(parseAmicOsVaultDocumentCopyPrepareInput({ ...base,
        requested_exact_version: { ...base.requested_exact_version, mime_type }, title: 'Synthetic copy', mode: 'clone', file: null }).file).toBeNull();
    }
  });
  it('rejects extra authority, missing Matter, oversize, unsupported MIME and mismatched edited MIME', () => {
    const valid = { ...base, title: 'Synthetic copy', mode: 'clone', file: null };
    for (const value of [ { ...valid, authority_kind: 'lawos-dms' }, { ...valid, lawos_matter_id: null },
      { ...valid, requested_exact_version: { ...base.requested_exact_version, byte_size: 25 * 1024 * 1024 + 1 } },
      { ...valid, requested_exact_version: { ...base.requested_exact_version, mime_type: 'application/x-executable' } },
      { ...valid, mode: 'upload' }, { ...valid, mode: 'upload', file: { filename: 'x.pdf', sha256: 'b'.repeat(64), byte_size: 8, mime_type: 'application/pdf' } },
    ]) expect(() => parseAmicOsVaultDocumentCopyPrepareInput(value)).toThrow();
    expect(() => parseAmicOsVaultOfficeCopyCreateInput({ ...base, title: 'Synthetic', resume: null })).toThrow();
    expect(() => parseAmicOsVaultDocumentCopyReadInput({ ...base, offset: -1 })).toThrow();
  });
});
