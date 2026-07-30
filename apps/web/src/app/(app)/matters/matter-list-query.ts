import type { ListMattersQueryDto } from '@amic-vault/shared';

export type MatterSearchParams = {
  clientId?: string | string[];
  q?: string | string[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function listMatterQueryFromSearchParams(
  searchParams: MatterSearchParams = {},
): Partial<ListMattersQueryDto> {
  const rawClientId = Array.isArray(searchParams.clientId)
    ? searchParams.clientId[0]
    : searchParams.clientId;
  const rawQ = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = rawQ?.trim();
  return {
    pageSize: 20,
    ...(rawClientId && uuidPattern.test(rawClientId) ? { clientId: rawClientId } : {}),
    ...(q ? { q } : {}),
  };
}
