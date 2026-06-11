import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { TenantId, TenantStatus } from '@amic-vault/shared';

export type TenantContextSource = 'pre-auth-header' | 'login-body' | 'session';

export interface TenantContext {
  tenantId: TenantId;
  slug: string;
  status: TenantStatus;
  source: TenantContextSource;
}

const storage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class TenantContextService {
  run<T>(context: TenantContext, callback: () => T): T {
    return storage.run(context, callback);
  }

  current(): TenantContext | undefined {
    return storage.getStore();
  }

  require(): TenantContext {
    const context = this.current();
    if (!context) {
      throw new Error('tenant context is not available');
    }
    return context;
  }
}
