import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopEditBridge,
  type DesktopBridgeNotification,
  type DesktopEditBridgeApi,
  type DesktopEditBridgeNative,
  type DesktopFileWatcher,
} from '../src/document-edit-bridge';

const session = {
  documentId: '11111111-1111-4111-8111-111111111201',
  editSessionId: '11111111-1111-4111-8111-111111111801',
  baseVersionId: '11111111-1111-4111-8111-111111111501',
  baseVersionNo: 1,
  lockToken: 'a'.repeat(64),
  expiresAt: '2026-07-04T12:00:00.000Z',
};

const editPackage = {
  documentId: session.documentId,
  editSessionId: session.editSessionId,
  baseVersionId: session.baseVersionId,
  baseVersionNo: session.baseVersionNo,
  filename: 'draft.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mode: 'binary_roundtrip' as const,
  sha256: 'b'.repeat(64),
};

function createHarness(saveSubversion: DesktopEditBridgeApi['saveSubversion']) {
  let onChange: (() => void) | null = null;
  const watcher: DesktopFileWatcher = { close: vi.fn() };
  const notifications: DesktopBridgeNotification[] = [];
  const api: DesktopEditBridgeApi = {
    checkout: vi.fn().mockResolvedValue(session),
    getEditPackage: vi.fn().mockResolvedValue(editPackage),
    downloadBaseFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    saveSubversion,
    checkIn: vi.fn().mockResolvedValue({ ...session, status: 'checked_in' }),
    cancel: vi.fn().mockResolvedValue({ ...session, status: 'cancelled' }),
  };
  const native: DesktopEditBridgeNative = {
    writeEditFile: vi.fn().mockResolvedValue({ path: '/tmp/amic-vault/draft.docx', filename: 'draft.docx' }),
    openDefaultApp: vi.fn().mockResolvedValue(undefined),
    readEditFile: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
    watchEditFile: vi.fn().mockImplementation((_file, handler) => {
      onChange = handler;
      return Promise.resolve(watcher);
    }),
  };
  const bridge = new DesktopEditBridge({
    api,
    native,
    debounceMs: 50,
    heartbeatMs: 500,
    maxSaveAttempts: 2,
    notify: (notification) => notifications.push(notification),
    retryMs: 25,
  });
  return {
    api,
    bridge,
    emitChange: () => {
      if (!onChange) throw new Error('watcher not registered');
      onChange();
    },
    native,
    notifications,
    watcher,
  };
}

describe('desktop document edit bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces file watcher changes into one review-copy save call', async () => {
    const saveReviewCopy = vi.fn().mockResolvedValue({
      subversionId: '11111111-1111-4111-8111-111111111901',
      displayVersion: 'v1.1',
    });
    const harness = createHarness(saveReviewCopy);

    await harness.bridge.open({ documentId: session.documentId, baseVersionId: session.baseVersionId });
    harness.emitChange();
    harness.emitChange();
    harness.emitChange();
    await vi.advanceTimersByTimeAsync(50);

    expect(saveReviewCopy).toHaveBeenCalledTimes(1);
    expect(saveReviewCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSaveId: `desktop-save:${session.editSessionId}:1`,
        editPackageMode: 'binary_roundtrip',
        expectedBaseSha256: editPackage.sha256,
        lockToken: session.lockToken,
        saveReasonCode: 'DESKTOP_SAVE',
        visibilityScope: 'matter_editors',
      }),
    );
    expect(harness.notifications.map((item) => item.state)).toEqual([
      'opening',
      'opened',
      'save_synced',
    ]);
    await harness.bridge.dispose();
    expect(harness.watcher.close).toHaveBeenCalledTimes(1);
  });

  it('retries a failed save with the same clientSaveId and reports notification transitions', async () => {
    const saveReviewCopy = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        subversionId: '11111111-1111-4111-8111-111111111902',
        displayVersion: 'v1.1',
      });
    const harness = createHarness(saveReviewCopy);

    await harness.bridge.open({ documentId: session.documentId, baseVersionId: session.baseVersionId });
    harness.emitChange();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(25);

    expect(saveReviewCopy).toHaveBeenCalledTimes(2);
    expect(saveReviewCopy.mock.calls[0]?.[0].clientSaveId).toBe(
      `desktop-save:${session.editSessionId}:1`,
    );
    expect(saveReviewCopy.mock.calls[1]?.[0].clientSaveId).toBe(
      `desktop-save:${session.editSessionId}:1`,
    );
    expect(harness.notifications.map((item) => item.state)).toEqual([
      'opening',
      'opened',
      'save_retrying',
      'save_synced',
    ]);
    await harness.bridge.dispose();
  });
});
