import { describe, expect, it } from 'vitest';
import { DocumentPermissionStub } from './document-permission.stub';

describe('DocumentPermissionStub', () => {
  it('keeps R1 document read and download permission paths denied', async () => {
    const stub = new DocumentPermissionStub();
    const ctx = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      userId: '11111111-1111-4111-8111-111111111101',
    };

    await expect(stub.canReadDocument(ctx, 'doc-1')).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'NOT_IMPLEMENTED',
    });
    await expect(stub.canDownloadDocument(ctx, 'doc-1', 'casework')).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'NOT_IMPLEMENTED',
    });
  });
});

