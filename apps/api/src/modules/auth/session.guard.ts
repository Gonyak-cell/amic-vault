import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../tenant/tenant-context';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import {
  hashOpaqueToken,
  readCookie,
  SESSION_COOKIE_NAME,
  type SessionRecord,
  SessionRepository,
} from './session.repository';

export interface RequestWithSession {
  headers: Record<string, string | string[] | undefined>;
  session?: SessionRecord;
}

function authRequired(): UnauthorizedException {
  return new UnauthorizedException({ code: 'AUTH_REQUIRED' });
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (!token) {
      throw authRequired();
    }

    const session = await this.sessions.findActiveByTokenHash(hashOpaqueToken(token));
    if (!session) {
      throw authRequired();
    }

    const tenant = await this.tenantService.findById(session.tenantId);
    if (!tenant || tenant.status !== 'active') {
      throw authRequired();
    }

    request.session = session;
    this.tenantContext.enter({
      tenantId: tenant.tenantId,
      slug: tenant.slug,
      status: tenant.status,
      source: 'session',
    });
    return true;
  }
}
