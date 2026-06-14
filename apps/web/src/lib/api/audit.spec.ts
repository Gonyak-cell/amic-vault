import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAuditEventsCsv } from './audit';

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
});
