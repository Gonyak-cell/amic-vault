export type DesktopBridgeNotificationState =
  | 'opening'
  | 'opened'
  | 'save_retrying'
  | 'save_synced'
  | 'save_failed'
  | 'checked_in'
  | 'cancelled';

export interface DesktopBridgeNotification {
  state: DesktopBridgeNotificationState;
  editSessionId?: string;
  attempt?: number;
}

export interface DesktopBridgeRequest {
  documentId: string;
  baseVersionId?: string;
  checkoutReasonCode?: string;
}

export interface DesktopEditSession {
  documentId: string;
  editSessionId: string;
  baseVersionId: string;
  baseVersionNo: number;
  lockToken: string;
  expiresAt: string;
}

export interface DesktopEditPackage {
  documentId: string;
  editSessionId: string;
  baseVersionId: string;
  baseVersionNo: number;
  filename: string;
  mimeType: string;
  mode: 'vault_text' | 'binary_roundtrip';
  sha256: string;
}

export interface DesktopLocalEditFile {
  path: string;
  filename: string;
}

export interface DesktopSavedSubversion {
  subversionId: string;
  displayVersion: string;
}

export interface DesktopFileWatcher {
  close(): void | Promise<void>;
}

export interface DesktopEditBridgeApi {
  checkout(input: {
    documentId: string;
    baseVersionId?: string;
    clientKind: 'office_desktop';
    checkoutReasonCode: string;
    idempotencyKey: string;
  }): Promise<DesktopEditSession>;
  getEditPackage(input: {
    documentId: string;
    editSessionId: string;
  }): Promise<DesktopEditPackage>;
  downloadBaseFile(input: {
    documentId: string;
    editSessionId: string;
  }): Promise<Uint8Array>;
  heartbeat(input: {
    documentId: string;
    editSessionId: string;
  }): Promise<void>;
  saveSubversion(input: {
    documentId: string;
    editSessionId: string;
    clientSaveId: string;
    editPackageMode: DesktopEditPackage['mode'];
    expectedBaseSha256: string;
    file: Uint8Array;
    filename: string;
    lockToken: string;
    mimeType: string;
    saveReasonCode: 'DESKTOP_SAVE';
    visibilityScope: 'matter_editors';
  }): Promise<DesktopSavedSubversion>;
  checkIn(input: {
    documentId: string;
    editSessionId: string;
    expectedLastSubversionId?: string;
    lockToken: string;
  }): Promise<DesktopEditSession>;
  cancel(input: {
    documentId: string;
    editSessionId: string;
    lockToken: string;
  }): Promise<DesktopEditSession>;
}

export interface DesktopEditBridgeNative {
  writeEditFile(input: {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
  }): Promise<DesktopLocalEditFile>;
  openDefaultApp(file: DesktopLocalEditFile): Promise<void>;
  readEditFile(file: DesktopLocalEditFile): Promise<Uint8Array>;
  watchEditFile(file: DesktopLocalEditFile, onChange: () => void): Promise<DesktopFileWatcher>;
}

export interface DesktopEditBridgeOptions {
  api: DesktopEditBridgeApi;
  native: DesktopEditBridgeNative;
  debounceMs?: number;
  heartbeatMs?: number;
  maxSaveAttempts?: number;
  notify?: (notification: DesktopBridgeNotification) => void;
  retryMs?: number;
}

interface ActiveDesktopEdit {
  file: DesktopLocalEditFile;
  lastSavedSubversionId?: string;
  package: DesktopEditPackage;
  saveOrdinal: number;
  session: DesktopEditSession;
  watcher: DesktopFileWatcher;
}

export class DesktopEditBridge {
  private active: ActiveDesktopEdit | null = null;
  private readonly debounceMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxSaveAttempts: number;
  private readonly notify: ((notification: DesktopBridgeNotification) => void) | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly retryMs: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: DesktopEditBridgeOptions) {
    this.debounceMs = options.debounceMs ?? 750;
    this.retryMs = options.retryMs ?? 2_000;
    this.maxSaveAttempts = options.maxSaveAttempts ?? 3;
    this.notify = options.notify;
  }

  async open(request: DesktopBridgeRequest): Promise<DesktopEditPackage> {
    await this.dispose();
    this.notifyState({ state: 'opening' });
    const checkout = await this.options.api.checkout({
      documentId: request.documentId,
      ...(request.baseVersionId ? { baseVersionId: request.baseVersionId } : {}),
      clientKind: 'office_desktop',
      checkoutReasonCode: request.checkoutReasonCode ?? 'DESKTOP_EDIT',
      idempotencyKey: desktopCheckoutIdempotencyKey(request),
    });
    const editPackage = await this.options.api.getEditPackage({
      documentId: checkout.documentId,
      editSessionId: checkout.editSessionId,
    });
    const bytes = await this.options.api.downloadBaseFile({
      documentId: checkout.documentId,
      editSessionId: checkout.editSessionId,
    });
    const file = await this.options.native.writeEditFile({
      bytes,
      filename: editPackage.filename,
      mimeType: editPackage.mimeType,
    });
    const watcher = await this.options.native.watchEditFile(file, () => this.queueSave());
    this.active = {
      file,
      package: editPackage,
      saveOrdinal: 0,
      session: checkout,
      watcher,
    };
    await this.options.native.openDefaultApp(file);
    this.startHeartbeat();
    this.notifyState({ state: 'opened', editSessionId: checkout.editSessionId });
    return editPackage;
  }

  queueSave(): void {
    if (!this.active) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, this.debounceMs);
  }

  async flushSave(): Promise<DesktopSavedSubversion | null> {
    if (!this.active) return null;
    this.active.saveOrdinal += 1;
    const clientSaveId = `desktop-save:${this.active.session.editSessionId}:${this.active.saveOrdinal}`;
    return this.saveWithRetry(clientSaveId, 1);
  }

  async checkIn(): Promise<DesktopEditSession | null> {
    if (!this.active) return null;
    const result = await this.options.api.checkIn({
      documentId: this.active.session.documentId,
      editSessionId: this.active.session.editSessionId,
      ...(this.active.lastSavedSubversionId
        ? { expectedLastSubversionId: this.active.lastSavedSubversionId }
        : {}),
      lockToken: this.active.session.lockToken,
    });
    this.notifyState({ state: 'checked_in', editSessionId: this.active.session.editSessionId });
    await this.dispose();
    return result;
  }

  async cancel(): Promise<DesktopEditSession | null> {
    if (!this.active) return null;
    const result = await this.options.api.cancel({
      documentId: this.active.session.documentId,
      editSessionId: this.active.session.editSessionId,
      lockToken: this.active.session.lockToken,
    });
    this.notifyState({ state: 'cancelled', editSessionId: this.active.session.editSessionId });
    await this.dispose();
    return result;
  }

  async dispose(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.saveTimer = null;
    this.retryTimer = null;
    this.heartbeatTimer = null;
    const watcher = this.active?.watcher;
    this.active = null;
    await watcher?.close();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const heartbeatMs = this.options.heartbeatMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      if (!this.active) return;
      void this.options.api.heartbeat({
        documentId: this.active.session.documentId,
        editSessionId: this.active.session.editSessionId,
      });
    }, heartbeatMs);
  }

  private async saveWithRetry(
    clientSaveId: string,
    attempt: number,
  ): Promise<DesktopSavedSubversion | null> {
    if (!this.active) return null;
    try {
      const file = await this.options.native.readEditFile(this.active.file);
      const result = await this.options.api.saveSubversion({
        documentId: this.active.session.documentId,
        editSessionId: this.active.session.editSessionId,
        clientSaveId,
        editPackageMode: this.active.package.mode,
        expectedBaseSha256: this.active.package.sha256,
        file,
        filename: this.active.package.filename,
        lockToken: this.active.session.lockToken,
        mimeType: this.active.package.mimeType,
        saveReasonCode: 'DESKTOP_SAVE',
        visibilityScope: 'matter_editors',
      });
      this.active.lastSavedSubversionId = result.subversionId;
      this.notifyState({
        state: 'save_synced',
        editSessionId: this.active.session.editSessionId,
        attempt,
      });
      return result;
    } catch (error) {
      if (attempt >= this.maxSaveAttempts) {
        this.notifyState({
          state: 'save_failed',
          editSessionId: this.active.session.editSessionId,
          attempt,
        });
        throw error;
      }
      this.notifyState({
        state: 'save_retrying',
        editSessionId: this.active.session.editSessionId,
        attempt,
      });
      return new Promise((resolve, reject) => {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.saveWithRetry(clientSaveId, attempt + 1).then(resolve, reject);
        }, this.retryMs);
      });
    }
  }

  private notifyState(notification: DesktopBridgeNotification): void {
    this.notify?.(notification);
  }
}

export function desktopCheckoutIdempotencyKey(request: DesktopBridgeRequest): string {
  return `desktop-edit:${request.documentId}:${request.baseVersionId ?? 'current'}`;
}
