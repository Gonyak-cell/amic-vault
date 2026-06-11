import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { TenantContextService } from './tenant-context';

interface RequestLike {
  path?: string;
  originalUrl?: string;
}

type ResponseLike = unknown;
type NextFunction = () => void;

const publicPathPatterns = [
  /^\/v1\/health(?:\/.*)?$/,
  /^\/v1\/auth\/login$/,
  /^\/v1\/auth\/password-reset\/.*$/,
  /^\/v1\/metrics$/,
  /^\/metrics$/,
];

function normalizePath(request: RequestLike): string {
  return (request.originalUrl ?? request.path ?? '').split('?')[0] ?? '';
}

function isPublicPath(path: string): boolean {
  return publicPathPatterns.some((pattern) => pattern.test(path));
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(@Inject(TenantContextService) private readonly tenantContext: TenantContextService) {}

  async use(request: RequestLike, _response: ResponseLike, next: NextFunction): Promise<void> {
    const path = normalizePath(request);
    if (isPublicPath(path)) {
      this.tenantContext.runRequest(next);
      return;
    }

    this.tenantContext.runRequest(next);
  }
}
