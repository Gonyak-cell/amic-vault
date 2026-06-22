import type { OutlookDocumentInsertionDto } from '@amic-vault/shared';
import type { OfficeBodyLike } from './outlook-item';

export interface OutlookShortcutOfficeLike {
  CoercionType?: {
    Html?: string;
  };
  context?: {
    mailbox?: {
      item?: {
        body?: OfficeBodyLike | null;
      } | null;
    } | null;
  } | null;
}

export function editPathForDocumentInsertion(
  insertion: OutlookDocumentInsertionDto | undefined,
): string | null {
  const editPath = insertion?.editPath?.trim();
  if (insertion?.status !== 'ready' || !editPath) return null;
  if (!editPath.startsWith('/documents/')) return null;
  return editPath;
}

export function absoluteVaultEditUrl(editPath: string, origin: string): string {
  const url = new URL(editPath, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/documents/')) {
    throw new Error('OUTLOOK_EDIT_PATH_UNSUPPORTED');
  }
  return url.toString();
}

export function buildVaultEditShortcutHtml(editUrl: string): string {
  const href = escapeHtmlAttribute(editUrl);
  return [
    '<p>',
    '<a href="',
    href,
    '">Vault에서 문서 편집 열기</a>',
    '</p>',
  ].join('');
}

export function insertVaultEditShortcut(
  office: OutlookShortcutOfficeLike | undefined,
  editUrl: string,
): Promise<void> {
  const body = office?.context?.mailbox?.item?.body;
  if (!body?.setSelectedDataAsync) {
    return Promise.reject(new Error('OUTLOOK_BODY_INSERT_UNAVAILABLE'));
  }

  const coercionType = office?.CoercionType?.Html ?? 'html';
  const html = buildVaultEditShortcutHtml(editUrl);
  return new Promise((resolve, reject) => {
    body.setSelectedDataAsync?.(html, { coercionType }, (result) => {
      if (result.status === 'succeeded') {
        resolve();
        return;
      }
      reject(new Error('OUTLOOK_BODY_INSERT_FAILED'));
    });
  });
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
