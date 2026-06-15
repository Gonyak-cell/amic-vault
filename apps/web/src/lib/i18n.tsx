'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Language = 'ko' | 'en';

type Translation = {
  ko: string;
  en: string;
};

const storageKey = 'amic-vault-language';

const translations = {
  'language.label': { ko: '언어', en: 'Language' },
  'language.korean': { ko: '한국어', en: 'Korean' },
  'language.english': { ko: 'English', en: 'English' },
  'nav.toggle': { ko: '메뉴 열기', en: 'Toggle navigation' },
  'nav.create': { ko: '새 Matter', en: 'New matter' },
  'nav.recent': { ko: '최근 항목', en: 'Recent' },
  'nav.favorites': { ko: '즐겨찾기', en: 'Favorites' },
  'nav.spaces': { ko: '워크스페이스', en: 'Workspaces' },
  'nav.globalSearch': {
    ko: 'Matter, 파일, 활동 검색',
    en: 'Search matters, files, and activity',
  },
  'nav.securityQueue': { ko: '보안 알림', en: 'Security alerts' },
  'nav.notifications': { ko: '알림', en: 'Notifications' },
  'nav.help': { ko: '도움말', en: 'Help' },
  'nav.settings': { ko: '설정', en: 'Settings' },
  'nav.dashboard': { ko: '홈', en: 'Home' },
  'nav.matters': { ko: 'Matter', en: 'Matters' },
  'nav.search': { ko: '검색', en: 'Search' },
  'nav.launch': { ko: '운영자 도구', en: 'Operator tools' },
  'nav.contracts': { ko: '계약 검토', en: 'Contract review' },
  'nav.dd': { ko: '실사 자료', en: 'Diligence' },
  'nav.litigation': { ko: '소송 자료', en: 'Litigation' },
  'nav.records': { ko: '보존 관리', en: 'Retention' },
  'nav.enterprise': { ko: '관리자 설정', en: 'Admin settings' },
  'nav.scale': { ko: '시스템 상태', en: 'System health' },
  'nav.audit': { ko: '활동 기록', en: 'Activity log' },
  'nav.walls': { ko: '정보 장벽', en: 'Information barriers' },
  'nav.liveActivity': { ko: '최근 활동', en: 'Recent activity' },
  'nav.aiEvidence': { ko: 'AI 검토 근거', en: 'AI evidence' },
  'auth.description': {
    ko: '워크스페이스 ID, 이메일, 비밀번호로 로그인하세요.',
    en: 'Sign in with your workspace ID, email, and password.',
  },
  'auth.tenantId': { ko: '워크스페이스 ID', en: 'Workspace ID' },
  'auth.email': { ko: '이메일', en: 'Email' },
  'auth.password': { ko: '비밀번호', en: 'Password' },
  'auth.invalid': {
    ko: '로그인 정보를 확인할 수 없습니다. 워크스페이스 ID와 계정을 다시 확인해 주세요.',
    en: 'We could not verify those login details.',
  },
  'auth.pending': { ko: '로그인 중', en: 'Signing in' },
  'auth.login': { ko: '로그인', en: 'Log in' },
  'auth.logout': { ko: '로그아웃', en: 'Log out' },
} as const satisfies Record<string, Translation>;

export type TranslationKey = keyof typeof translations;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function getTranslation(key: TranslationKey, language: Language): string {
  return translations[key][language];
}

function readStoredLanguage(): Language | undefined {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === 'ko' || stored === 'en' ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredLanguage(language: Language): void {
  try {
    window.localStorage.setItem(storageKey, language);
  } catch {
    // Language preference is non-critical; keep the app shell usable if storage is blocked.
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ko');

  useEffect(() => {
    const stored = readStoredLanguage();
    if (stored) {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'ko' ? 'ko' : 'en';
    document.documentElement.dataset.language = language;
    writeStoredLanguage(language);
  }, [language]);

  const setLanguage = useCallback((next: Language) => setLanguageState(next), []);
  const t = useCallback((key: TranslationKey) => getTranslation(key, language), [language]);

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside LanguageProvider');
  }
  return context;
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div
      aria-label={t('language.label')}
      className="inline-flex h-9 shrink-0 items-center rounded-md border bg-background p-1 text-xs font-semibold"
      role="group"
    >
      {(['ko', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={`h-7 rounded px-2.5 transition-colors ${
            language === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={language === option}
          onClick={() => setLanguage(option)}
        >
          {option === 'ko' ? t('language.korean') : t('language.english')}
        </button>
      ))}
    </div>
  );
}
