export const API_NO_STORE_HEADER_VALUE =
  'no-store, no-cache, max-age=0, must-revalidate, private';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

export function applyNoStoreHeaders(response: ResponseLike): void {
  response.setHeader('cache-control', API_NO_STORE_HEADER_VALUE);
  response.setHeader('pragma', 'no-cache');
  response.setHeader('expires', '0');
}

export function enforceNoStoreHeaders(response: ResponseLike): void {
  const originalSetHeader = response.setHeader.bind(response);
  response.setHeader = (name: string, value: string): void => {
    if (name.toLowerCase() === 'cache-control') {
      originalSetHeader('cache-control', API_NO_STORE_HEADER_VALUE);
      return;
    }
    originalSetHeader(name, value);
  };
  applyNoStoreHeaders(response);
}

export function noStoreApiMiddleware(
  _request: unknown,
  response: ResponseLike,
  next: NextFunction,
): void {
  enforceNoStoreHeaders(response);
  next();
}
