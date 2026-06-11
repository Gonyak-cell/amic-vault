import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';

const requestIdStorage = new AsyncLocalStorage<string>();
const requestIdPattern = /^[A-Za-z0-9._:-]{1,80}$/;

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function sanitizeRequestId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return requestIdPattern.test(value) ? value : undefined;
}

export function currentRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestIdStorage.run(requestId, callback);
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: RequestLike, response: ResponseLike, next: NextFunction): void {
    const requestId = sanitizeRequestId(firstHeader(request.headers['x-request-id'])) ?? randomUUID();
    response.setHeader('x-request-id', requestId);
    runWithRequestId(requestId, next);
  }
}
