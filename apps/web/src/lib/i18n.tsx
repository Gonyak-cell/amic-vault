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
  'language.label': { ko: '언어', en: '언어' },
  'language.korean': { ko: '한국어', en: '한국어' },
  'language.english': { ko: '영어', en: '영어' },
  'nav.toggle': { ko: '내비게이션 열기', en: '내비게이션 열기' },
  'nav.create': { ko: '새 사건', en: '새 사건' },
  'nav.recent': { ko: '최근 항목', en: '최근 항목' },
  'nav.favorites': { ko: '즐겨찾기', en: '즐겨찾기' },
  'nav.spaces': { ko: '공간', en: '공간' },
  'nav.globalSearch': {
    ko: '사건, 파일, 활동 검색',
    en: '사건, 파일, 활동 검색',
  },
  'nav.securityQueue': { ko: '보안 알림', en: '보안 알림' },
  'nav.notifications': { ko: '알림', en: '알림' },
  'nav.help': { ko: '도움말', en: '도움말' },
  'nav.settings': { ko: '설정', en: '설정' },
  'nav.dashboard': { ko: '홈', en: '홈' },
  'nav.matters': { ko: '사건', en: '사건' },
  'nav.search': { ko: '검색', en: '검색' },
  'nav.launch': { ko: '운영 상태', en: '운영 상태' },
  'nav.contracts': { ko: '계약 검토', en: '계약 검토' },
  'nav.dd': { ko: '실사 자료실', en: '실사 자료실' },
  'nav.litigation': { ko: '소송 자료실', en: '소송 자료실' },
  'nav.records': { ko: '기록 보존', en: '기록 보존' },
  'nav.enterprise': { ko: '관리 설정', en: '관리 설정' },
  'nav.scale': { ko: '운영 지표', en: '운영 지표' },
  'nav.audit': { ko: '접근 기록', en: '접근 기록' },
  'nav.walls': { ko: '정보 차단', en: '정보 차단' },
  'nav.liveActivity': { ko: '실시간 활동', en: '실시간 활동' },
  'nav.aiEvidence': { ko: 'AI 근거', en: 'AI 근거' },
  'auth.description': {
    ko: '워크스페이스 ID, 이메일, 비밀번호로 로그인하세요.',
    en: '워크스페이스 ID, 이메일, 비밀번호로 로그인하세요.',
  },
  'auth.invalid': {
    ko: '로그인 정보를 확인할 수 없습니다.',
    en: '로그인 정보를 확인할 수 없습니다.',
  },
  'auth.pending': { ko: '확인 중', en: '확인 중' },
  'auth.login': { ko: '로그인', en: '로그인' },
  'auth.logout': { ko: '로그아웃', en: '로그아웃' },
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
    document.documentElement.lang = 'ko';
    document.documentElement.dataset.language = 'ko';
    writeStoredLanguage('ko');
    setLanguageState('ko');
  }, []);

  const setLanguage = useCallback(() => setLanguageState('ko'), []);
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
  const { t } = useI18n();
  return (
    <div
      aria-label={t('language.label')}
      className="inline-flex h-9 shrink-0 items-center rounded-md border bg-background p-1 text-xs font-semibold"
      role="status"
    >
      <span className="inline-flex h-7 items-center rounded bg-primary px-2.5 text-primary-foreground">
        {t('language.korean')}
      </span>
    </div>
  );
}
