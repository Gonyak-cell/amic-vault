export const protectedPaths = [
  '/dashboard',
  '/matters',
  '/clients',
  '/documents',
  '/files',
  '/search',
  '/work',
  '/contracts',
  '/dd',
  '/litigation',
  '/records',
  '/admin',
  '/enterprise',
  '/integrations',
  '/scale',
  '/audit',
  '/walls',
  '/notifications',
] as const;

export function isProtectedAppPath(pathname: string): boolean {
  return protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const fallbackNextPath = '/dashboard';
const internalUrlOrigin = 'https://amic-vault.invalid';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const searchQueryKeys = [
  'q',
  'page',
  'searchRef',
  'matterId',
  'clientId',
  'confidentialityLevel',
  'documentType',
  'extractionStatus',
  'ocrConfidence',
  'legalHold',
  'recordsStatus',
  'versionStatus',
  'dateRange',
  'clientName',
  'groupBy',
  'matterCode',
  'matterName',
  'mode',
  'privilegeStatus',
  'sortBy',
  'target',
] as const;

const documentQueryKeys = [
  'edit',
  'versionId',
  'from',
  'target',
  'hit',
  'hitCount',
  'anchor',
  'chunk',
] as const;

const matterQueryKeys = ['created', 'tab'] as const;
const matterListQueryKeys = ['clientId', 'q'] as const;
const workQueryKeys = ['view', 'assignee', 'kind', 'limit', 'offset'] as const;
const recordsQueryKeys = ['tab', 'matterId'] as const;

const safeHashValues = new Set([
  'document-editing',
  'matter-overview',
  'matter-dashboard',
  'matter-related',
  'matter-issues',
  'matter-conflicts',
  'matter-closing',
  'matter-governance',
  'matter-parties',
  'matter-ai',
  'matter-knowledge',
  'matter-graph',
  'matter-citations',
  'matter-wiki',
  'matter-documents',
  'matter-files',
  'matter-work',
  'matter-workstreams',
  'matter-team',
  'matter-activity',
]);

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function hasMalformedPercentEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') continue;
    const encodedByte = value.slice(index + 1, index + 3);
    if (!/^[0-9a-f]{2}$/i.test(encodedByte)) return true;
    index += 2;
  }
  return false;
}

function queryKeysForPath(pathname: string): readonly string[] {
  if (pathname === '/search/folders' || pathname === '/search/folders/') return ['searchRef'];
  if (pathname === '/search') return searchQueryKeys;
  if (pathname === '/documents' || pathname.startsWith('/documents/')) return documentQueryKeys;
  if (pathname === '/matters') return matterListQueryKeys;
  if (pathname.startsWith('/matters/')) return matterQueryKeys;
  if (pathname === '/work' || pathname.startsWith('/work/')) return workQueryKeys;
  if (pathname === '/records' || pathname.startsWith('/records/')) return recordsQueryKeys;
  return [];
}

function queryValueIsSafe(key: string, value: string): boolean {
  if (!value || value.length > 2048) return false;
  if (key === 'searchRef' || key === 'matterId' || key === 'clientId' || key === 'versionId') {
    return uuidPattern.test(value);
  }
  if (key === 'edit') return value === '1' || value === 'true';
  if (key === 'created') return value === '1';
  if (key === 'from') return value === 'search';
  if (key === 'target') return value === 'all' || value === 'title' || value === 'body';
  if (key === 'page' || key === 'pageSize' || key === 'hit' || key === 'hitCount') {
    return /^[1-9][0-9]{0,5}$/.test(value);
  }
  if (key === 'limit') {
    const limit = Number(value);
    return /^[1-9][0-9]{0,2}$/.test(value) && limit <= 100;
  }
  if (key === 'offset') return /^(?:0|[1-9][0-9]{0,8})$/.test(value);
  if (key === 'chunk') return /^[1-9][0-9]{0,2}$/.test(value);
  if (key === 'anchor') return /^vph-[1-9][0-9-]{2,20}$/.test(value);
  if (key === 'tab') return /^[a-z][a-z0-9-]{0,48}$/.test(value);
  if (key === 'view') return value === 'mine' || value === 'notifications';
  if (key === 'assignee') return value === 'all' || value === 'mine' || value === 'unassigned';
  if (key === 'sortBy' || key === 'groupBy' || key === 'mode') {
    return /^[a-z][a-z0-9_-]{0,48}$/.test(value);
  }
  if (key === 'legalHold') return value === 'all' || value === 'true' || value === 'false';
  return !value.includes('\\') && !hasControlCharacters(value);
}

function safeQuery(pathname: string, url: URL, rawSearch: string): string {
  const allowedKeys = queryKeysForPath(pathname);
  if (allowedKeys.length === 0 || hasMalformedPercentEncoding(rawSearch)) return '';

  const query = new URLSearchParams();
  for (const key of allowedKeys) {
    const values = url.searchParams.getAll(key);
    if (values.length !== 1) continue;
    const value = values[0];
    if (value !== undefined && queryValueIsSafe(key, value)) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function safeHash(pathname: string, url: URL): string {
  if (!url.hash || pathname === '/search/folders' || pathname === '/search/folders/') return '';
  let hash: string;
  try {
    hash = decodeURIComponent(url.hash.slice(1)).toLowerCase();
  } catch {
    return '';
  }
  return safeHashValues.has(hash) ? `#${hash}` : '';
}

/**
 * Keep only a relative, same-origin route and its explicitly supported state.
 * This is shared by the middleware producer and the login consumer so a
 * user-controlled `next` can never become an external redirect or login loop.
 */
export function safeNextPath(nextPathAndSearch: string | null | undefined): string {
  if (
    typeof nextPathAndSearch !== 'string' ||
    !nextPathAndSearch ||
    !nextPathAndSearch.startsWith('/') ||
    nextPathAndSearch.startsWith('//')
  ) {
    return fallbackNextPath;
  }

  const queryStart = nextPathAndSearch.search(/[?#]/);
  const rawPath = queryStart === -1 ? nextPathAndSearch : nextPathAndSearch.slice(0, queryStart);
  if (rawPath.includes('\\') || hasMalformedPercentEncoding(rawPath)) return fallbackNextPath;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
    for (let pass = 0; pass < 4; pass += 1) {
      const nextDecodedPath = decodeURIComponent(decodedPath);
      if (nextDecodedPath === decodedPath) break;
      decodedPath = nextDecodedPath;
    }
  } catch {
    return fallbackNextPath;
  }
  if (
    decodedPath.includes('\\') ||
    hasControlCharacters(decodedPath) ||
    !decodedPath.startsWith('/') ||
    decodedPath.startsWith('//') ||
    /%(?:2f|5c)/i.test(decodedPath)
  ) {
    return fallbackNextPath;
  }

  let url: URL;
  try {
    url = new URL(nextPathAndSearch, internalUrlOrigin);
  } catch {
    return fallbackNextPath;
  }
  if (url.origin !== internalUrlOrigin) return fallbackNextPath;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return fallbackNextPath;
  }
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return fallbackNextPath;
  const normalizedPathname = pathname.toLowerCase();
  if (normalizedPathname === '/login' || normalizedPathname.startsWith('/login/')) {
    return fallbackNextPath;
  }
  if (!isProtectedAppPath(pathname)) return fallbackNextPath;

  const rawSearch = queryStart === -1 ? '' : nextPathAndSearch.slice(queryStart);
  return `${url.pathname}${safeQuery(pathname, url, rawSearch)}${safeHash(pathname, url)}`;
}

/** Resolve a single login query value; duplicate or malformed values fail closed. */
export function resolveLoginNextPath(search: string | URLSearchParams | null | undefined): string {
  let params: URLSearchParams;
  try {
    params =
      search instanceof URLSearchParams
        ? search
        : new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : '');
  } catch {
    return fallbackNextPath;
  }
  const nextValues = params.getAll('next');
  return nextValues.length === 1 ? safeNextPath(nextValues[0]) : fallbackNextPath;
}

export function loginRedirectUrl(origin: string, nextPathAndSearch: string): string {
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('next', safeNextPath(nextPathAndSearch));
  return loginUrl.toString();
}

export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  return isProtectedAppPath(pathname) && !hasSession;
}
