import { describe, expect, it, vi } from 'vitest';
import { DocumentController } from './document.controller';

const matterId = '11111111-1111-4111-8111-111111111122';
const actorUserId = '11111111-1111-4111-8111-111111111101';

describe('DocumentController quarantine ingress', () => {
  it('returns 202 and never invokes primary upload when the default-off flag is explicitly enabled', async () => {
    const previous = process.env.FILE_SECURITY_QUARANTINE_ENABLED;
    process.env.FILE_SECURITY_QUARANTINE_ENABLED = 'true';
    const upload = vi.fn();
    const intake = vi.fn(async () => ({
      status: 'quarantined' as const,
      matterId,
      quarantineRef: '11111111-1111-4111-8111-111111111188',
    }));
    const status = vi.fn();
    const controller = new DocumentController(
      { upload } as never,
      { intake } as never,
      {} as never,
    );

    try {
      await expect(
        controller.upload(
          { session: { userId: actorUserId } } as never,
          matterId,
          {},
          { path: '/tmp/contract.pdf', originalname: 'contract.pdf', mimetype: 'application/pdf', size: 12 },
          { status },
        ),
      ).resolves.toMatchObject({ status: 'quarantined' });
      expect(status).toHaveBeenCalledWith(202);
      expect(intake).toHaveBeenCalledOnce();
      expect(upload).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.FILE_SECURITY_QUARANTINE_ENABLED;
      else process.env.FILE_SECURITY_QUARANTINE_ENABLED = previous;
    }
  });
});
