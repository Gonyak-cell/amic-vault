import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api-client';
import { searchOrgDirectorySubjects } from './org-directory';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(async (path: string) => ({ path })),
}));

describe('org directory API client', () => {
  it('queries subjects with purpose and matter scope without request bodies', async () => {
    await searchOrgDirectorySubjects({
      limit: 12,
      matterId: '11111111-1111-4111-8111-111111111901',
      purpose: 'matter-team',
      q: 'Alpha Partner',
      subjectType: 'user',
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/org-directory/subjects?limit=12&matterId=11111111-1111-4111-8111-111111111901&purpose=matter-team&q=Alpha+Partner&subjectType=user',
    );
  });
});
