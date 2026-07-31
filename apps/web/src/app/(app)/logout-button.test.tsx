import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logout } from '@/lib/auth';
import { LogoutButton } from './logout-button';

vi.mock('@/lib/auth', () => ({
  logout: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: () => '로그아웃' }),
}));

describe('LogoutButton', () => {
  const replace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { replace } });
  });

  it.each([
    ['successful', async () => ({ accepted: true as const })],
    ['failed', async () => Promise.reject(new Error('network unavailable'))],
  ])('replaces the current entry after a %s logout request', async (_state, result) => {
    vi.mocked(logout).mockImplementationOnce(result);

    const button = LogoutButton({});
    await button.props.onClick();

    expect(logout).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
