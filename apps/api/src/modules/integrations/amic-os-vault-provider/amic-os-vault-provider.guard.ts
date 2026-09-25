import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantContextService } from '../../tenant/tenant-context';
import { normalizeAccountLedgerId, UserService } from '../../user/user.service';
import { AMIC_OS_VAULT_MAX_EXPORT_BYTES } from './amic-os-vault-provider.contract';

export const AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER = 'x-amic-os-vault-provider-token';
export const AMIC_OS_VAULT_ACCOUNT_LEDGER_HEADER = 'x-amic-os-account-ledger-id';

export interface AmicOsVaultProviderPrincipal {
  accountLedgerId: string;
  tenantId: string;
  actorUserId: string;
}

export interface RequestWithAmicOsVaultProvider {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  amicOsVaultPrincipal?: AmicOsVaultProviderPrincipal;
}

function authRequired(): UnauthorizedException {
  return new UnauthorizedException({ code: 'AUTH_REQUIRED' });
}

function sha256Buffer(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function hasControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}

@Injectable()
export class AmicOsVaultProviderConfig {
  isEnabled(): boolean {
    return process.env.AMIC_OS_VAULT_PROVIDER_ENABLED === 'true';
  }

  acceptsCredential(value: string | string[] | undefined): boolean {
    const expected = this.credential();
    if (!this.isEnabled() || !expected || typeof value !== 'string') return false;
    return timingSafeEqual(sha256Buffer(value), sha256Buffer(expected));
  }

  grantTokenHash(fingerprint: string): string {
    const credential = this.credential();
    if (!this.isEnabled() || !credential) throw authRequired();
    const keyed = createHmac('sha256', credential)
      .update('amic-os-vault-export-grant-v1\0', 'utf8')
      .update(fingerprint, 'utf8')
      .digest('hex');
    return `sha256:${keyed}`;
  }

  authorityRef(): string {
    return 'amic-vault-api:oa12';
  }

  providerRevision(): string {
    const configured = process.env.AMIC_OS_VAULT_PROVIDER_REVISION;
    return configured && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(configured)
      ? configured
      : 'oa12-exact-copy-v1';
  }

  acceptsClientTenant(osTenantId: string, vaultTenantId: string): boolean {
    const logical = process.env.AMIC_OS_CLIENT_DOCUMENT_LOGICAL_TENANT_ID;
    const vault = process.env.AMIC_OS_CLIENT_DOCUMENT_VAULT_TENANT_ID;
    return Boolean(this.isEnabled() && logical && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(logical)
      && vault && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(vault)
      && logical === osTenantId && vault === vaultTenantId);
  }

  uploadAuthorityRef(): string {
    return 'amic-vault-api:single-install';
  }

  uploadProviderRevision(): string {
    const configured = process.env.AMIC_OS_VAULT_UPLOAD_PROVIDER_REVISION;
    return configured && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(configured)
      ? configured
      : 'single-install-upload-v1';
  }

  officeEditBinding(fingerprint: string): { editSessionId: string; lockToken: string } {
    const credential = this.credential();
    if (!this.isEnabled() || !credential || !fingerprint || Buffer.byteLength(fingerprint, 'utf8') > 4096) {
      throw authRequired();
    }
    const sessionBytes = createHmac('sha256', credential)
      .update('amic-os-vault-office-session-v1\0', 'utf8')
      .update(fingerprint, 'utf8')
      .digest()
      .subarray(0, 16);
    sessionBytes[6] = (sessionBytes[6]! & 0x0f) | 0x40;
    sessionBytes[8] = (sessionBytes[8]! & 0x3f) | 0x80;
    const hex = sessionBytes.toString('hex');
    const editSessionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const lockToken = createHmac('sha256', credential)
      .update('amic-os-vault-office-lock-v1\0', 'utf8')
      .update(editSessionId, 'utf8')
      .digest('hex');
    return { editSessionId, lockToken };
  }

  maxExportBytes(): number {
    const configured = Number(process.env.AMIC_OS_VAULT_PROVIDER_MAX_EXPORT_BYTES);
    return Number.isSafeInteger(configured) && configured > 0 && configured <= AMIC_OS_VAULT_MAX_EXPORT_BYTES
      ? configured
      : AMIC_OS_VAULT_MAX_EXPORT_BYTES;
  }

  private credential(): string | null {
    const value = process.env.AMIC_OS_VAULT_PROVIDER_TOKEN;
    if (
      !value ||
      Buffer.byteLength(value, 'utf8') < 32 ||
      Buffer.byteLength(value, 'utf8') > 4096 ||
      hasControl(value)
    ) {
      return null;
    }
    return value;
  }
}

function assertedAccountLedgerId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const principal = (body as Record<string, unknown>).principal;
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)) return null;
  const value = (principal as Record<string, unknown>).user_id;
  return typeof value === 'string' ? normalizeAccountLedgerId(value) : null;
}

function assertedHeaderAccountLedgerId(
  value: string | string[] | undefined,
): string | null {
  return typeof value === 'string' ? normalizeAccountLedgerId(value) : null;
}

@Injectable()
export class AmicOsVaultProviderGuard implements CanActivate {
  constructor(
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAmicOsVaultProvider>();
    if (!this.config.acceptsCredential(request.headers[AMIC_OS_VAULT_PROVIDER_TOKEN_HEADER])) {
      throw authRequired();
    }

    const bodyAccountLedgerId = assertedAccountLedgerId(request.body);
    const headerAccountLedgerId = assertedHeaderAccountLedgerId(
      request.headers[AMIC_OS_VAULT_ACCOUNT_LEDGER_HEADER],
    );
    if (
      bodyAccountLedgerId &&
      headerAccountLedgerId &&
      bodyAccountLedgerId !== headerAccountLedgerId
    ) {
      throw authRequired();
    }
    const accountLedgerId = headerAccountLedgerId ?? bodyAccountLedgerId;
    if (!accountLedgerId) throw authRequired();

    let candidate: Awaited<ReturnType<UserService['findLoginCandidateByAccountLedgerId']>>;
    try {
      candidate = await this.userService.findLoginCandidateByAccountLedgerId(accountLedgerId);
    } catch {
      throw authRequired();
    }
    if (
      !candidate ||
      candidate.tenant.status !== 'active' ||
      candidate.user.status !== 'active' ||
      candidate.user.tenantId !== candidate.tenant.tenantId
    ) {
      throw authRequired();
    }

    request.amicOsVaultPrincipal = {
      accountLedgerId,
      tenantId: candidate.tenant.tenantId,
      actorUserId: candidate.user.userId,
    };
    this.tenantContext.enter({
      tenantId: candidate.tenant.tenantId,
      slug: candidate.tenant.slug,
      status: candidate.tenant.status,
      source: 'amic-os-provider',
    });
    return true;
  }
}
