import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantContextService } from '../../tenant/tenant-context';
import type { UserService } from '../../user/user.service';
import {
  AMIC_OS_VAULT_ACCOUNT_LEDGER_HEADER,
  AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER,
  AmicOsVaultProviderConfig,
  AmicOsVaultProviderGuard,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '22222222-2222-4222-8222-222222222222';
const token = 'provider-secret-that-is-longer-than-thirty-two-bytes';

function candidate(status: 'active' | 'inactive' = 'active') {
  const now = new Date('2026-08-29T00:00:00.000Z');
  return {
    tenant: {
      tenantId,
      name: 'AMIC',
      slug: 'amic',
      region: 'kr',
      dataResidency: 'kr',
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    },
    user: {
      userId: actorUserId,
      tenantId,
      email: 'user@example.invalid',
      name: 'User',
      role: 'matter_owner' as const,
      practiceGroup: null,
      status,
      passwordHash: 'not-used',
      mfaEnabled: false,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function context(request: RequestWithAmicOsVaultProvider): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
      getResponse: <T>() => undefined as T,
      getNext: <T>() => undefined as T,
    }),
  } as unknown as ExecutionContext;
}

describe('AmicOsVaultProviderGuard', () => {
  beforeEach(() => {
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_ENABLED', 'true');
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_TOKEN', token);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires the dedicated credential before account-ledger lookup', async () => {
    const userService = {
      findLoginCandidateByAccountLedgerId: vi.fn(async () => candidate()),
    } as unknown as UserService;
    const guard = new AmicOsVaultProviderGuard(
      new AmicOsVaultProviderConfig(),
      userService,
      new TenantContextService(),
    );
    const request = {
      headers: {},
      body: { principal: { user_id: 'user_amic_jwsuh' } },
    };

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userService.findLoginCandidateByAccountLedgerId).not.toHaveBeenCalled();
  });

  it('resolves active identity, ignores caller tenant authority, and enters provider context', async () => {
    const tenantContext = new TenantContextService();
    const userService = {
      findLoginCandidateByAccountLedgerId: vi.fn(async () => candidate()),
    } as unknown as UserService;
    const guard = new AmicOsVaultProviderGuard(
      new AmicOsVaultProviderConfig(),
      userService,
      tenantContext,
    );
    const request: RequestWithAmicOsVaultProvider = {
      headers: { [AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER]: token },
      body: {
        principal: {
          tenant_id: 'attacker-selected-tenant',
          user_id: 'USER_AMIC_JWSUH',
        },
      },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.amicOsVaultPrincipal).toEqual({
      accountLedgerId: 'user_amic_jwsuh',
      tenantId,
      actorUserId,
    });
    expect(tenantContext.require()).toMatchObject({
      tenantId,
      source: 'amic-os-provider',
    });
  });

  it('authenticates multipart requests from the bounded account-ledger header and rejects body/header disagreement', async () => {
    const userService = {
      findLoginCandidateByAccountLedgerId: vi.fn(async () => candidate()),
    } as unknown as UserService;
    const guard = new AmicOsVaultProviderGuard(
      new AmicOsVaultProviderConfig(),
      userService,
      new TenantContextService(),
    );
    const multipartRequest: RequestWithAmicOsVaultProvider = {
      headers: {
        [AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER]: token,
        [AMIC_OS_VAULT_ACCOUNT_LEDGER_HEADER]: 'USER_AMIC_JWSUH',
      },
    };

    await expect(guard.canActivate(context(multipartRequest))).resolves.toBe(true);
    expect(userService.findLoginCandidateByAccountLedgerId).toHaveBeenCalledWith(
      'user_amic_jwsuh',
    );

    const confusedRequest: RequestWithAmicOsVaultProvider = {
      headers: {
        [AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER]: token,
        [AMIC_OS_VAULT_ACCOUNT_LEDGER_HEADER]: 'user_amic_jwsuh',
      },
      body: { principal: { user_id: 'user_other_account' } },
    };
    await expect(guard.canActivate(context(confusedRequest))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when disabled, the token is short, or the mapped user is inactive', async () => {
    const userService = {
      findLoginCandidateByAccountLedgerId: vi.fn(async () => candidate('inactive')),
    } as unknown as UserService;
    const tenantContext = new TenantContextService();
    const request = {
      headers: { [AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER]: token },
      body: { principal: { user_id: 'user_amic_jwsuh' } },
    };
    const guard = new AmicOsVaultProviderGuard(
      new AmicOsVaultProviderConfig(),
      userService,
      tenantContext,
    );

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_ENABLED', 'false');
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_ENABLED', 'true');
    vi.stubEnv('AMIC_OS_VAULT_PROVIDER_TOKEN', 'short');
    request.headers[AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER] = 'short';
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
