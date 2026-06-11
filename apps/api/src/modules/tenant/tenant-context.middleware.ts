import {
  ForbiddenException,
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { TenantContextSource } from './tenant-context';
import { TenantContextService } from './tenant-context';
import { TenantService } from './tenant.service';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  path?: string;
  originalUrl?: string;
  body?: { tenantId?: string; tenantSlug?: string };
}

type ResponseLike = unknown;
type NextFunction = () => void;

const publicPathPatterns = [
  /^\/v1\/health(?:\/.*)?$/,
  /^\/v1\/auth\/login$/,
  /^\/v1\/auth\/password-reset\/.*$/,
  /^\/metrics$/,
];

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizePath(request: RequestLike): string {
  return (request.originalUrl ?? request.path ?? '').split('?')[0] ?? '';
}

function isPublicPath(path: string): boolean {
  return publicPathPatterns.some((pattern) => pattern.test(path));
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(TenantService) private readonly tenantService: TenantService,
  ) {}

  async use(request: RequestLike, _response: ResponseLike, next: NextFunction): Promise<void> {
    const path = normalizePath(request);
    if (isPublicPath(path)) {
      next();
      return;
    }

    const tenantHeader = firstHeader(request.headers['x-tenant-id']);
    const tenantId = tenantHeader ?? request.body?.tenantId;
    const tenantSlug = request.body?.tenantSlug;

    if (!tenantId && !tenantSlug) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    }

    const tenant = tenantId
      ? await this.tenantService.findById(tenantId)
      : await this.tenantService.findBySlug(tenantSlug ?? '');

    if (!tenant || tenant.status !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    const source: TenantContextSource = tenantHeader ? 'pre-auth-header' : 'login-body';
    this.tenantContext.run(
      {
        tenantId: tenant.tenantId,
        slug: tenant.slug,
        status: tenant.status,
        source,
      },
      next,
    );
  }
}
