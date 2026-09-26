import { describe, expect, it } from 'vitest';
import {
  parseAmicOsVaultNativeCopyBindingInput,
  parseAmicOsVaultNativeCopyListInput,
  parseAmicOsVaultNativeCopyPrepareInput,
  parseAmicOsVaultNativeCopyReadInput,
} from './amic-os-vault-document-copy.contract';

const exactVersion = {
  document_id: '11111111-1111-4111-8111-111111111111',
  version_id: '22222222-2222-4222-8222-222222222222',
  file_object_id: '33333333-3333-4333-8333-333333333333',
  sha256: 'a'.repeat(64),
  byte_size: 17,
  mime_type: 'application/pdf',
};
const base = {
  principal: { tenant_id: 'lawos-tenant', user_id: 'user_amic_jwsuh' },
  lawos_matter_id: 'MATTER-2026-0042',
  requested_exact_version: exactVersion,
  copy_id: 'document-copy:44444444-4444-4444-8444-444444444444',
  snapshot_id: 'document-copy-snapshot:55555555-5555-4555-8555-555555555555',
};

describe('AMIC OS Vault native document-copy contract', () => {
  it.each(['application/pdf', 'message/rfc822']) (
    'accepts exact immutable %s clone/upload bindings',
    (mimeType) => {
      const version = { ...exactVersion, mime_type: mimeType };
      expect(parseAmicOsVaultNativeCopyPrepareInput({
        ...base,
        requested_exact_version: version,
        title: '보관 사본',
        mode: 'clone',
        file: null,
      })).toMatchObject({ mode: 'clone', requested_exact_version: version });
      expect(parseAmicOsVaultNativeCopyPrepareInput({
        ...base,
        requested_exact_version: version,
        title: '보관 사본',
        mode: 'upload',
        file: {
          filename: mimeType === 'application/pdf' ? 'renamed.pdf' : 'renamed.eml',
          sha256: version.sha256,
          byte_size: version.byte_size,
          mime_type: version.mime_type,
        },
      })).toMatchObject({ mode: 'upload' });
    },
  );

  it('rejects edited immutable content, unsupported MIME, extra fields, and malformed identities', () => {
    const prepare = {
      ...base,
      title: '보관 사본',
      mode: 'upload',
      file: {
        filename: 'changed.pdf',
        sha256: exactVersion.sha256,
        byte_size: exactVersion.byte_size,
        mime_type: exactVersion.mime_type,
      },
    };
    expect(() => parseAmicOsVaultNativeCopyPrepareInput({
      ...prepare,
      file: { ...prepare.file, sha256: 'b'.repeat(64) },
    })).toThrow();
    expect(() => parseAmicOsVaultNativeCopyPrepareInput({
      ...prepare,
      requested_exact_version: { ...exactVersion, mime_type: 'text/plain' },
      file: { ...prepare.file, mime_type: 'text/plain' },
    })).toThrow();
    expect(() => parseAmicOsVaultNativeCopyPrepareInput({ ...prepare, storage_uri: 's3://leak' }))
      .toThrow();
    expect(() => parseAmicOsVaultNativeCopyBindingInput({ ...base, copy_id: 'document-copy:bad' }))
      .toThrow();
  });

  it('accepts only aligned chunk offsets and bounded opaque list cursors', () => {
    expect(parseAmicOsVaultNativeCopyReadInput({ ...base, offset: 0 })).toMatchObject({ offset: 0 });
    expect(parseAmicOsVaultNativeCopyReadInput({ ...base, offset: 3 * 1024 * 1024 }))
      .toMatchObject({ offset: 3 * 1024 * 1024 });
    expect(() => parseAmicOsVaultNativeCopyReadInput({ ...base, offset: 1 })).toThrow();
    expect(parseAmicOsVaultNativeCopyListInput({
      principal: base.principal,
      lawos_matter_id: base.lawos_matter_id,
      requested_exact_version: base.requested_exact_version,
      limit: 50,
      cursor: 'dcp1.valid_cursor',
    })).toMatchObject({ limit: 50, cursor: 'dcp1.valid_cursor' });
    expect(() => parseAmicOsVaultNativeCopyListInput({
      principal: base.principal,
      lawos_matter_id: base.lawos_matter_id,
      requested_exact_version: base.requested_exact_version,
      limit: 51,
    })).toThrow();
  });
});
