import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserResponseDto, TenantId } from '@amic-vault/shared';
import { getCurrentUserWithoutRedirect } from '@/lib/auth';
import { LoginForm } from './login-form';

const effectHarness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}));

const currentUser: CurrentUserResponseDto = {
  user: {
    email: 'alpha-matter-owner@test.local',
    lastLoginAt: null,
    mfaEnabled: false,
    name: 'Alpha Matter Owner',
    practiceGroup: null,
    role: 'matter_owner',
    status: 'active',
    tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
    userId: '11111111-1111-4111-8111-111111111101',
  },
};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effectHarness.effects.push(effect);
    },
    useState: <T,>(initial: T) => [initial, vi.fn()] as const,
  };
});
vi.mock('@/lib/auth', () => ({
  getCurrentUserWithoutRedirect: vi.fn(),
  login: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({
  LanguageToggle: () => null,
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('LoginForm session restoration effect', () => {
  const replace = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    effectHarness.effects.length = 0;
    vi.stubGlobal('window', {
      addEventListener,
      location: {
        replace,
        search: '?next=%2Fwork%3Fview%3Dnotifications%26assignee%3Dmine',
      },
      removeEventListener,
    });
  });

  it('checks the initial session and unregisters the page-cache listener', async () => {
    vi.mocked(getCurrentUserWithoutRedirect).mockResolvedValueOnce(currentUser);

    LoginForm();
    expect(effectHarness.effects).toHaveLength(1);
    const cleanup = effectHarness.effects[0]?.();

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/work?view=notifications&assignee=mine');
    });
    expect(addEventListener).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith('pageshow', expect.any(Function));

    expect(cleanup).toBeTypeOf('function');
    cleanup?.();
    expect(removeEventListener).toHaveBeenCalledWith(
      'pageshow',
      addEventListener.mock.calls[0]?.[1],
    );
  });

  it('keeps the form for an absent session and rechecks only a persisted pageshow', async () => {
    vi.mocked(getCurrentUserWithoutRedirect)
      .mockRejectedValueOnce(new Error('AUTH_REQUIRED'))
      .mockResolvedValueOnce(currentUser);

    LoginForm();
    effectHarness.effects[0]?.();
    await vi.waitFor(() => {
      expect(getCurrentUserWithoutRedirect).toHaveBeenCalledOnce();
    });
    expect(replace).not.toHaveBeenCalled();

    const pageShow = addEventListener.mock.calls[0]?.[1];
    expect(pageShow).toBeTypeOf('function');
    if (typeof pageShow !== 'function') throw new Error('pageshow handler is missing');
    pageShow({ persisted: false });
    expect(getCurrentUserWithoutRedirect).toHaveBeenCalledOnce();

    pageShow({ persisted: true });
    await vi.waitFor(() => {
      expect(getCurrentUserWithoutRedirect).toHaveBeenCalledTimes(2);
      expect(replace).toHaveBeenCalledWith('/work?view=notifications&assignee=mine');
    });
  });
});
