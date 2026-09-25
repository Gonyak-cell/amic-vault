import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export type ClientDocumentAction = 'dms:document:read' | 'dms:document:write' | 'dms:document:download';
export interface ClientDocumentAuthority {
  tenantId: string;
  actorUserId: string;
  osTenantId: string;
  partyId: string;
  workspaceRef: string;
  action: ClientDocumentAction;
  decisionRef: string;
  requestId: string;
}

/** Installed only by the guarded AMIC OS Client controller for the current call. */
@Injectable()
export class ClientDocumentAuthorityContext {
  private readonly storage = new AsyncLocalStorage<Readonly<ClientDocumentAuthority>>();

  run<T>(authority: ClientDocumentAuthority, callback: () => T): T {
    return this.storage.run(Object.freeze({ ...authority }), callback);
  }

  current(): Readonly<ClientDocumentAuthority> | undefined {
    return this.storage.getStore();
  }
}
