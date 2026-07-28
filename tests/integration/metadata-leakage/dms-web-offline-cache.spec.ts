import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const origin = 'https://vault.example';
const serviceWorkerSource = fs.readFileSync(
  path.join(process.cwd(), 'apps/web/public/sw.js'),
  'utf8',
);

type ServiceWorkerRequest = {
  headers: Headers;
  method: string;
  mode: string;
  url: string;
};

type LifecycleEvent = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type FetchEvent = {
  request: ServiceWorkerRequest;
  respondWith: (promise: Promise<Response>) => void;
};

type ServiceWorkerEvent = LifecycleEvent | FetchEvent;
type ServiceWorkerListener = (event: ServiceWorkerEvent) => void;

function absoluteUrl(value: string | ServiceWorkerRequest): string {
  return new URL(typeof value === 'string' ? value : value.url, origin).href;
}

function request(
  pathname: string,
  options: { headers?: HeadersInit; mode?: string } = {},
): ServiceWorkerRequest {
  return {
    headers: new Headers(options.headers),
    method: 'GET',
    mode: options.mode ?? 'same-origin',
    url: new URL(pathname, origin).href,
  };
}

function createServiceWorkerDriver(
  initialCaches: Record<string, string[]> = {},
  options: { networkFails?: boolean } = {},
) {
  const listeners = new Map<string, ServiceWorkerListener>();
  const stores = new Map<string, Map<string, Response>>();
  let cacheReads = 0;
  let cacheWrites = 0;

  for (const [cacheName, urls] of Object.entries(initialCaches)) {
    stores.set(
      cacheName,
      new Map(urls.map((url) => [absoluteUrl(url), new Response('stale')])),
    );
  }

  const cacheStorage = {
    async delete(name: string) {
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async match(value: string | ServiceWorkerRequest) {
      cacheReads += 1;
      const key = absoluteUrl(value);
      for (const cache of stores.values()) {
        const cached = cache.get(key);
        if (cached) return cached.clone();
      }
      return undefined;
    },
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        async addAll(urls: string[]) {
          for (const url of urls) {
            store.set(absoluteUrl(url), new Response('shell'));
            cacheWrites += 1;
          }
        },
        async put(value: ServiceWorkerRequest, response: Response) {
          store.set(absoluteUrl(value), response.clone());
          cacheWrites += 1;
        },
      };
    },
  };

  const serviceWorkerGlobal = {
    addEventListener(type: string, listener: ServiceWorkerListener) {
      listeners.set(type, listener);
    },
    clients: {
      claim: async () => undefined,
    },
    location: { origin },
    skipWaiting: async () => undefined,
  };

  vm.runInNewContext(serviceWorkerSource, {
    Headers,
    Promise,
    Response,
    Set,
    URL,
    caches: cacheStorage,
    fetch: async () => {
      if (options.networkFails) throw new Error('network unavailable');
      return new Response('network', {
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      });
    },
    self: serviceWorkerGlobal,
  });

  async function dispatchLifecycle(type: 'activate' | 'install') {
    let pending: Promise<unknown> | undefined;
    listeners.get(type)?.({
      waitUntil(promise) {
        pending = promise;
      },
    });
    await pending;
  }

  async function dispatchFetch(swRequest: ServiceWorkerRequest) {
    let response: Promise<Response> | undefined;
    listeners.get('fetch')?.({
      request: swRequest,
      respondWith(promise) {
        response = promise;
      },
    });
    return {
      responded: response !== undefined,
      response: response ? await response : undefined,
    };
  }

  return {
    cacheOperations: () => ({ reads: cacheReads, writes: cacheWrites }),
    cacheUrls: (name: string) => [...(stores.get(name)?.keys() ?? [])].sort(),
    cacheNames: () => [...stores.keys()].sort(),
    dispatchFetch,
    dispatchLifecycle,
  };
}

describe('DMS web offline cache policy', () => {
  it('pre-caches only the queryless public application shell', async () => {
    const driver = createServiceWorkerDriver();

    await driver.dispatchLifecycle('install');

    expect(driver.cacheNames()).toEqual(['amic-vault-desktop-shell-v2']);
    expect(driver.cacheUrls('amic-vault-desktop-shell-v2')).toEqual(
      [
        '/offline.html',
        '/manifest.webmanifest',
        '/icons/amic-vault-icon.svg',
        '/icons/amic-vault-icon-192.png',
        '/icons/amic-vault-icon-512.png',
        '/icons/amic-vault-maskable.svg',
        '/icons/amic-vault-maskable-512.png',
        '/icons/amic-vault-wordmark.svg',
      ]
        .map((value) => absoluteUrl(value))
        .sort(),
    );
  });

  it('removes every prior cache, including simulated customer data', async () => {
    const driver = createServiceWorkerDriver({
      'amic-vault-desktop-shell-v1': [
        '/files?selected=document-id',
        '/v1/search?q=confidential-snippet',
        '/v1/documents/document-id/preview?token=secret',
      ],
      'unrelated-old-cache': ['/documents/document-id'],
      'amic-vault-desktop-shell-v2': ['/offline.html'],
    });

    await driver.dispatchLifecycle('activate');

    expect(driver.cacheNames()).toEqual(['amic-vault-desktop-shell-v2']);
    expect(driver.cacheUrls('amic-vault-desktop-shell-v2')).toEqual([
      absoluteUrl('/offline.html'),
    ]);
  });

  it('never opens or reads Cache Storage for DMS routes, preview tokens, or search snippets', async () => {
    const driver = createServiceWorkerDriver();
    await driver.dispatchLifecycle('install');
    const baseline = driver.cacheOperations();

    for (const swRequest of [
      request('/files?selected=document-id'),
      request('/search?q=confidential-snippet'),
      request('/documents/document-id'),
      request('/v1/search?q=confidential-snippet'),
      request('/v1/documents/document-id/preview?token=secret'),
    ]) {
      await expect(driver.dispatchFetch(swRequest)).resolves.toMatchObject({ responded: false });
    }

    expect(driver.cacheOperations()).toEqual(baseline);
  });

  it('caches a queryless public asset but bypasses token, auth, and cookie variants', async () => {
    const driver = createServiceWorkerDriver();
    await driver.dispatchLifecycle('install');

    await expect(
      driver.dispatchFetch(request('/_next/static/chunks/app.js')),
    ).resolves.toMatchObject({ responded: true });

    const afterPublicAsset = driver.cacheOperations();
    for (const swRequest of [
      request('/_next/static/chunks/app.js?preview_token=secret'),
      request('/_next/static/chunks/app.js', { headers: { authorization: 'Bearer secret' } }),
      request('/_next/static/chunks/app.js', { headers: { cookie: 'tenant=tenant-b' } }),
    ]) {
      await expect(driver.dispatchFetch(swRequest)).resolves.toMatchObject({ responded: false });
    }

    expect(driver.cacheOperations()).toEqual(afterPublicAsset);
    expect(driver.cacheUrls('amic-vault-desktop-shell-v2')).toContain(
      absoluteUrl('/_next/static/chunks/app.js'),
    );
  });

  it('returns only the content-free shell when a public navigation loses the network', async () => {
    const driver = createServiceWorkerDriver({}, { networkFails: true });
    await driver.dispatchLifecycle('install');
    const beforeNavigation = driver.cacheOperations();

    const result = await driver.dispatchFetch(request('/help', { mode: 'navigate' }));

    expect(result.responded).toBe(true);
    expect(await result.response?.text()).toBe('shell');
    expect(driver.cacheOperations()).toEqual({
      reads: beforeNavigation.reads + 1,
      writes: beforeNavigation.writes,
    });
  });
});
