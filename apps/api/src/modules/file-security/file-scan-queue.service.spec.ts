import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileScanQueueService, fileSecurityScanSendOptions } from './file-scan-queue.service';

const previousProcessRole = process.env.PROCESS_ROLE;
const previousWorkerEnabled = process.env.FILE_SECURITY_SCAN_WORKER_ENABLED;
afterEach(() => {
  if (previousProcessRole === undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE = previousProcessRole;
  if (previousWorkerEnabled === undefined) delete process.env.FILE_SECURITY_SCAN_WORKER_ENABLED; else process.env.FILE_SECURITY_SCAN_WORKER_ENABLED = previousWorkerEnabled;
});

describe('fileSecurityScanSendOptions', () => {
  it('coalesces ten duplicate payloads by opaque quarantine reference', () => {
    const payload = { tenantId: '11111111-1111-4111-8111-111111111111', quarantineRef: '22222222-2222-4222-8222-222222222222', expectedSha256: 'a'.repeat(64) };
    const client = { query: async () => ({ rows: [] }) } as never;
    const keys = Array.from({ length: 10 }, () => fileSecurityScanSendOptions(payload, client).singletonKey);
    expect(new Set(keys)).toEqual(new Set([payload.quarantineRef]));
    expect(fileSecurityScanSendOptions(payload, client)).toMatchObject({ retryLimit: 3, deadLetter: 'security.file-scan.dead' });
  });

  it('registers the consumer only for the worker role', async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    const registry = { register: vi.fn(), consumer: vi.fn().mockResolvedValue({ work }) };
    const handler = { handle: vi.fn() };
    process.env.PROCESS_ROLE = 'api'; delete process.env.FILE_SECURITY_SCAN_WORKER_ENABLED;
    await new FileScanQueueService(handler as never, registry as never).onModuleInit();
    expect(registry.consumer).not.toHaveBeenCalled();

    process.env.PROCESS_ROLE = 'worker';
    await new FileScanQueueService(handler as never, registry as never).onModuleInit();
    expect(registry.consumer).toHaveBeenCalledWith('security.file-scan');
    expect(work).toHaveBeenCalledOnce();
  });
});
