import { expect } from 'vitest';
import type { MatterSuggestionListDto, SearchResponseDto } from '@amic-vault/shared';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';

export interface LoginInput {
  tenantId: string;
  email: string;
  password: string;
}

export type SearchHttpResponse = SearchResponseDto;
export type MatterSuggestionHttpResponse = MatterSuggestionListDto;

export async function loginSearchUser(baseUrl: string, input: LoginInput): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      email: input.email,
      password: input.password,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

export async function postSearch(
  baseUrl: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<SearchHttpResponse> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(201);
  return JSON.parse(text) as SearchHttpResponse;
}

export async function postMatterSuggestions(
  baseUrl: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<MatterSuggestionHttpResponse> {
  const response = await fetch(`${baseUrl}/v1/search/matter-suggestions`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(201);
  return JSON.parse(text) as MatterSuggestionHttpResponse;
}

export function resultTitles(response: SearchHttpResponse): string[] {
  return response.results.map((result) => result.title);
}
