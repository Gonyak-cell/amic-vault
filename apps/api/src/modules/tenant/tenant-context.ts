import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { TenantId, TenantStatus } from '@amic-vault/shared';

export type TenantContextSource = 'session';

export interface TenantContext {
  tenantId: TenantId;
  slug: string;
  status: TenantStatus;
  source: TenantContextSource;
}

interface TenantContextHolder {
  context?: TenantContext;
}

const storage = new AsyncLocalStorage<TenantContextHolder>();

@Injectable()
export class TenantContextService {
  run<T>(context: TenantContext, callback: () => T): T {
    return storage.run({ context }, callback);
  }

  runRequest<T>(callback: () => T): T {
    return storage.run({}, callback);
  }

  enter(context: TenantContext): void {
    const holder = storage.getStore();
    if (holder) {
      holder.context = context;
      return;
    }
    storage.enterWith({ context });
  }

  current(): TenantContext | undefined {
    return storage.getStore()?.context;
  }

  require(): TenantContext {
    const context = this.current();
    if (!context) {
      throw new Error('tenant context is not available');
    }
    return context;
  }
}
