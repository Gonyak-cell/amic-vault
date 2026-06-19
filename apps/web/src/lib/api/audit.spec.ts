import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAuditEventsCsv, listDocumentAuditEvents } from './audit';

describe('audit API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports audit CSV with credentialed no-store fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('event_id,action\n'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportAuditEventsCsv({ action: 'DOCUMENT_VIEWED' })).resolves.toBe(
      'event_id,action\n',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/audit-events/export.csv?action=DOCUMENT_VIEWED',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('lists document audit events through the document-scoped endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listDocumentAuditEvents('11111111-1111-4111-8111-111111111201', { limit: 8 }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/v1/documents/11111111-1111-4111-8111-111111111201/audit-events?limit=8',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });
});
