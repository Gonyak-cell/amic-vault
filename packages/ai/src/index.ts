import type { AiModelRoute, ErrorCode } from '@amic-vault/shared';

export interface RetrievalRequest {
  tenantId: string;
  userId: string;
  matterId: string;
  query: string;
}

export interface RetrievalResult {
  status: 'not-implemented-before-r6';
  deniedCode?: ErrorCode;
}

export interface RetrievalOrchestrator {
  /**
   * R6에서만 구현한다. R6 전에는 인터페이스 placeholder 외 구현 코드 추가 금지.
   */
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}

export interface LocalGemmaRouteConfig {
  route: AiModelRoute;
  enabled: boolean;
  endpoint?: string | undefined;
}

export interface LocalGemmaHealthResult {
  status: 'ready' | 'blocked';
  route: AiModelRoute;
  reasonCode?: 'route_disabled' | 'endpoint_missing' | 'non_local_endpoint' | 'local_endpoint_unhealthy';
}

export interface GatewayTransport {
  fetch(url: string, init: { method: 'GET' }): Promise<{ ok: boolean; status: number }>;
}

export class LocalGemmaGateway {
  constructor(
    private readonly config: LocalGemmaRouteConfig,
    private readonly transport: GatewayTransport = defaultTransport(),
  ) {}

  async health(): Promise<LocalGemmaHealthResult> {
    if (!this.config.enabled) return blocked('route_disabled');
    if (!this.config.endpoint) return blocked('endpoint_missing');
    const endpoint = localEndpoint(this.config.endpoint);
    if (!endpoint) return blocked('non_local_endpoint');
    const response = await this.transport.fetch(new URL('/health', endpoint).toString(), {
      method: 'GET',
    });
    if (!response.ok) return blocked('local_endpoint_unhealthy');
    return { status: 'ready', route: 'local_gemma' };
  }
}

export function isR6EnabledModelRoute(route: string): route is AiModelRoute {
  return route === 'local_gemma';
}

function blocked(reasonCode: NonNullable<LocalGemmaHealthResult['reasonCode']>): LocalGemmaHealthResult {
  return { status: 'blocked', route: 'local_gemma', reasonCode };
}

function defaultTransport(): GatewayTransport {
  return {
    async fetch(url, init) {
      const response = await fetch(url, init);
      return { ok: response.ok, status: response.status };
    },
  };
}

function localEndpoint(endpoint: string): URL | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host === 'gemma' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.svc') ||
    isPrivateIpv4(host)
  ) {
    return url;
  }
  return null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
