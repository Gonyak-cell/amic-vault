'use strict';

const CACHE_NAME = 'amic-vault-desktop-shell-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/amic-vault-icon.svg',
  '/icons/amic-vault-icon-192.png',
  '/icons/amic-vault-icon-512.png',
  '/icons/amic-vault-maskable.svg',
  '/icons/amic-vault-maskable-512.png',
  '/icons/amic-vault-wordmark.svg',
];
const ALLOWED_CACHE_PREFIXES = ['/_next/static/', '/fonts/amic/', '/icons/'];
const ALLOWED_CACHE_PATHS = new Set(['/manifest.webmanifest', OFFLINE_URL]);
const DENIED_CACHE_PREFIXES = [
  '/v1',
  '/dashboard',
  '/matters',
  '/search',
  '/documents',
  '/audit',
  '/records',
  '/ai',
  '/contracts',
  '/dd',
  '/litigation',
  '/enterprise',
  '/scale',
  '/walls',
  '/external',
  '/login',
];

function exactOrDescendant(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isDeniedPath(pathname) {
  return DENIED_CACHE_PREFIXES.some((prefix) => exactOrDescendant(pathname, prefix));
}

function isAllowedCachePath(pathname) {
  return (
    ALLOWED_CACHE_PATHS.has(pathname) ||
    ALLOWED_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function hasExplicitAuthHeader(request) {
  return request.headers.has('authorization');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cacheControl = response.headers.get('cache-control') || '';
  if (response.ok && !/no-store/i.test(cacheControl)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (hasExplicitAuthHeader(request) || isDeniedPath(url.pathname)) return;

  if (isAllowedCachePath(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});
