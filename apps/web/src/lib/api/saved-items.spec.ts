import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import {
  createSavedItem,
  listSavedItems,
  removeSavedItem,
  reorderSavedItems,
} from './saved-items';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

const targetId = '11111111-1111-4111-8111-111111111114';
const savedItemId = '11111111-1111-4111-8111-111111111914';

describe('saved items API client', () => {
  it('uses the personal saved-item endpoints without sending display metadata', async () => {
    await listSavedItems();
    await createSavedItem({ targetType: 'document', targetId });
    await removeSavedItem(savedItemId);
    await reorderSavedItems({ savedItemIds: [savedItemId] });

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/saved-items');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/saved-items', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'document', targetId }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(3, `/saved-items/${savedItemId}`, {
      method: 'DELETE',
    });
    expect(apiFetch).toHaveBeenNthCalledWith(4, '/saved-items/order', {
      method: 'PUT',
      body: JSON.stringify({ savedItemIds: [savedItemId] }),
    });
    expect(String(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body)).not.toMatch(
      /label|title|matterName|snippet/i,
    );
  });
});
