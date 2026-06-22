import { describe, expect, it, vi } from 'vitest';
import {
  absoluteVaultEditUrl,
  buildVaultEditShortcutHtml,
  editPathForDocumentInsertion,
  insertVaultEditShortcut,
} from './outlook-shortcut';

describe('Outlook edit shortcut helpers', () => {
  const insertion = {
    insertionId: '11111111-1111-4111-8111-111111111901',
    status: 'ready',
    documentId: '11111111-1111-4111-8111-111111111902',
    versionId: '11111111-1111-4111-8111-111111111903',
    insertionMode: 'internal-reference',
    sourceClient: 'outlook-web-addin',
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    internalReference:
      'amic-vault://documents/11111111-1111-4111-8111-111111111902/versions/11111111-1111-4111-8111-111111111903',
    editReference:
      'amic-vault://documents/11111111-1111-4111-8111-111111111902/edit?versionId=11111111-1111-4111-8111-111111111903',
    editPath:
      '/documents/11111111-1111-4111-8111-111111111902?edit=1&versionId=11111111-1111-4111-8111-111111111903#document-editing',
  } as const;

  it('accepts only ready relative Vault document edit paths', () => {
    expect(editPathForDocumentInsertion(insertion)).toBe(insertion.editPath);
    expect(editPathForDocumentInsertion({ ...insertion, status: 'denied' })).toBeNull();
    expect(editPathForDocumentInsertion({ ...insertion, editPath: 'https://example.test/doc' })).toBeNull();
  });

  it('builds same-origin edit URLs and HTML without exposing raw refs as visible text', () => {
    const url = absoluteVaultEditUrl(insertion.editPath, 'https://vault.example.test');
    const html = buildVaultEditShortcutHtml(url);

    expect(url).toBe(
      'https://vault.example.test/documents/11111111-1111-4111-8111-111111111902?edit=1&versionId=11111111-1111-4111-8111-111111111903#document-editing',
    );
    expect(html).toContain('href="https://vault.example.test/documents/');
    expect(html).toContain('Vault에서 문서 편집 열기');
    expect(html).not.toContain('>11111111');
    expect(() =>
      absoluteVaultEditUrl('https://evil.example.test/documents/ref', 'https://vault.example.test'),
    ).toThrow('OUTLOOK_EDIT_PATH_UNSUPPORTED');
  });

  it('inserts the shortcut into Outlook compose body via setSelectedDataAsync', async () => {
    const setSelectedDataAsync = vi.fn(
      (
        _data: string,
        _options: { coercionType?: string },
        callback?: (result: { status: string }) => void,
      ) => callback?.({ status: 'succeeded' }),
    );

    await expect(
      insertVaultEditShortcut(
        {
          CoercionType: { Html: 'html' },
          context: { mailbox: { item: { body: { setSelectedDataAsync } } } },
        },
        'https://vault.example.test/documents/doc?edit=1',
      ),
    ).resolves.toBeUndefined();

    expect(setSelectedDataAsync).toHaveBeenCalledWith(
      expect.stringContaining('Vault에서 문서 편집 열기'),
      { coercionType: 'html' },
      expect.any(Function),
    );
  });
});
