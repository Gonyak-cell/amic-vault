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
  'nav.toggle': { ko: 'Navigation 열기', en: 'Toggle navigation' },
  'nav.create': { ko: 'Create', en: 'Create' },
  'nav.recent': { ko: 'Recent', en: 'Recent' },
  'nav.favorites': { ko: 'Favorites', en: 'Favorites' },
  'nav.spaces': { ko: 'Spaces', en: 'Spaces' },
  'nav.globalSearch': {
    ko: 'Matter, document, event 검색',
    en: 'Search matters, documents, events',
  },
  'nav.securityQueue': { ko: 'Security Queue', en: 'Security Queue' },
  'nav.notifications': { ko: '알림', en: 'Notifications' },
  'nav.help': { ko: '도움말', en: 'Help' },
  'nav.settings': { ko: '설정', en: 'Settings' },
  'nav.dashboard': { ko: 'Dashboard', en: 'Dashboard' },
  'nav.matters': { ko: 'Matters', en: 'Matters' },
  'nav.search': { ko: 'Search', en: 'Search' },
  'nav.contracts': { ko: 'Contracts', en: 'Contracts' },
  'nav.dd': { ko: 'DD Vault', en: 'DD Vault' },
  'nav.litigation': { ko: 'Litigation', en: 'Litigation' },
  'nav.records': { ko: 'Records', en: 'Records' },
  'nav.enterprise': { ko: 'Enterprise', en: 'Enterprise' },
  'nav.scale': { ko: 'Scale', en: 'Scale' },
  'nav.audit': { ko: 'Audit', en: 'Audit' },
  'nav.walls': { ko: 'Walls', en: 'Walls' },
  'nav.liveActivity': { ko: 'Live Activity', en: 'Live Activity' },
  'nav.aiEvidence': { ko: 'AI Evidence', en: 'AI Evidence' },
  'auth.description': {
    ko: 'Tenant, email, password로 접속합니다.',
    en: 'Sign in with tenant, email, and password.',
  },
  'auth.invalid': {
    ko: '로그인 정보를 확인할 수 없습니다.',
    en: 'We could not verify those login details.',
  },
  'auth.pending': { ko: '확인 중', en: 'Checking' },
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
