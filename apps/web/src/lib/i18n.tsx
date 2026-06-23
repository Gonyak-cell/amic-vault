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
import { ChevronDown } from 'lucide-react';

export type Language = 'ko' | 'en';

type Translation = {
  ko: string;
  en: string;
};

const storageKey = 'amic-vault-language';

const translations = {
  'language.label': { ko: '언어', en: 'Language' },
  'language.korean': { ko: '한국어', en: 'Korean' },
  'language.english': { ko: '영어', en: 'English' },
  'app.homeAria': { ko: 'AMIC Vault 홈', en: 'AMIC Vault home' },
  'nav.toggle': { ko: '메뉴 열기', en: 'Toggle navigation' },
  'nav.close': { ko: '메뉴 닫기', en: 'Close navigation' },
  'nav.mobileLabel': { ko: 'Vault 내비게이션', en: 'Vault navigation' },
  'nav.create': { ko: 'New Matter', en: 'New Matter' },
  'nav.recent': { ko: '최근 항목', en: 'Recent' },
  'nav.favorites': { ko: '즐겨찾기', en: 'Favorites' },
  'nav.spaces': { ko: '워크스페이스', en: 'Workspaces' },
  'nav.globalSearch': {
    ko: 'Matter, 파일, 활동 검색',
    en: 'Search matters, files, and activity',
  },
  'nav.searchAria': { ko: 'Vault 검색', en: 'Vault search' },
  'nav.searchPlaceholder': {
    ko: 'Matter, 파일, 담당자 검색',
    en: 'Search matters, files, or people',
  },
  'nav.group.vault': { ko: 'Vault', en: 'Vault' },
  'nav.group.governance': { ko: '정책 관리', en: 'Governance' },
  'nav.group.audit': { ko: '감사', en: 'Audit' },
  'nav.group.security': { ko: '보안', en: 'Security' },
  'nav.group.admin': { ko: '관리', en: 'Admin' },
  'nav.group.integrations': { ko: '통합', en: 'Integrations' },
  'nav.group.aiPrep': { ko: 'AI Prep', en: 'AI Prep' },
  'nav.securityQueue': { ko: '보안 알림', en: 'Security alerts' },
  'nav.notifications': { ko: '알림', en: 'Notifications' },
  'nav.help': { ko: '도움말', en: 'Help' },
  'nav.settings': { ko: '설정', en: 'Settings' },
  'nav.dashboard': { ko: '홈', en: 'Home' },
  'nav.matters': { ko: 'Matter', en: 'Matters' },
  'nav.files': { ko: '문서함', en: 'Document vault' },
  'nav.workQueue': { ko: '작업함', en: 'Work queue' },
  'nav.search': { ko: '문서 검색', en: 'Document search' },
  'nav.searchFolders': { ko: '검색 폴더', en: 'Search folders' },
  'nav.outlook': { ko: 'Outlook', en: 'Outlook' },
  'nav.launch': { ko: '운영자 도구', en: 'Operator tools' },
  'nav.contracts': { ko: '계약 검토', en: 'Contract review' },
  'nav.dd': { ko: '실사 자료', en: 'Diligence' },
  'nav.litigation': { ko: '소송 자료', en: 'Litigation' },
  'nav.records': { ko: '기록 보존', en: 'Retention' },
  'nav.enterprise': { ko: '관리자 설정', en: 'Admin settings' },
  'nav.scale': { ko: '시스템 상태', en: 'System health' },
  'nav.audit': { ko: '접근 기록', en: 'Activity log' },
  'nav.walls': { ko: '정보 차단', en: 'Information barriers' },
  'nav.liveActivity': { ko: '최근 활동', en: 'Recent activity' },
  'nav.aiEvidence': { ko: 'AI 검토 근거', en: 'AI evidence' },
  'auth.description': {
    ko: '계정 ID 또는 이메일과 비밀번호로 로그인하세요. 권한 확인 후 AMIC Vault에 접근합니다.',
    en: 'Sign in with your account ID or email and password. Access is checked before AMIC Vault opens.',
  },
  'auth.identifier': { ko: '계정 ID 또는 이메일', en: 'Account ID or email' },
  'auth.email': { ko: '이메일', en: 'Email' },
  'auth.password': { ko: '비밀번호', en: 'Password' },
  'auth.newPassword': { ko: '새 비밀번호', en: 'New password' },
  'auth.confirmPassword': { ko: '비밀번호 확인', en: 'Confirm password' },
  'auth.invalid': {
    ko: '로그인 정보를 확인할 수 없습니다. 이메일과 비밀번호를 다시 확인해 주세요.',
    en: 'We could not verify those login details.',
  },
  'auth.pending': { ko: '로그인 중', en: 'Signing in' },
  'auth.login': { ko: '로그인', en: 'Log in' },
  'auth.logout': { ko: '로그아웃', en: 'Log out' },
  'auth.resetDescription': {
    ko: '새 비밀번호를 설정하면 계정이 활성화됩니다.',
    en: 'Set a new password to activate your account.',
  },
  'auth.resetMissingToken': {
    ko: '재설정 링크가 유효하지 않습니다.',
    en: 'The reset link is not valid.',
  },
  'auth.resetPasswordTooShort': {
    ko: '비밀번호는 8자 이상이어야 합니다.',
    en: 'Password must be at least 8 characters.',
  },
  'auth.resetPasswordMismatch': {
    ko: '비밀번호가 일치하지 않습니다.',
    en: 'Passwords do not match.',
  },
  'auth.resetFailed': {
    ko: '링크가 만료되었거나 이미 사용되었습니다.',
    en: 'The link has expired or has already been used.',
  },
  'auth.resetPending': { ko: '활성화 중', en: 'Activating' },
  'auth.resetSubmit': { ko: '계정 활성화', en: 'Activate account' },
  'auth.resetComplete': {
    ko: '계정이 활성화되었습니다. 새 비밀번호로 로그인하세요.',
    en: 'Your account is active. Sign in with your new password.',
  },
  'auth.resetLogin': { ko: '로그인으로 이동', en: 'Go to log in' },
  'profile.aria': { ko: '사용자 프로필', en: 'User profile' },
  'profile.loading': { ko: '계정 정보 불러오는 중', en: 'Loading account details' },
  'profile.error': { ko: '계정 정보를 표시할 수 없습니다', en: 'Account details unavailable' },
  'route.blocked.defaultArea': { ko: '제한된 화면', en: 'Restricted screen' },
  'route.blocked.description': {
    ko: '권한과 운영 정책이 확인된 화면만 표시됩니다.',
    en: 'Only screens confirmed by permissions and operational policy are shown.',
  },
  'route.blocked.title': {
    ko: '이 화면은 표시할 수 없습니다.',
    en: 'This screen cannot be displayed.',
  },
  'route.blocked.cardTitle': { ko: '표시할 수 없는 화면', en: 'Unavailable screen' },
  'route.blocked.cardMeta': { ko: '운영 노출 차단', en: 'Production visibility blocked' },
  'route.blocked.defaultReason': {
    ko: '현재 운영 범위에 포함되지 않은 화면입니다.',
    en: 'This screen is not included in the current production scope.',
  },
  'route.blocked.adminReason': {
    ko: '이 화면은 관리자 권한과 운영 정책이 확인된 계정에만 표시됩니다.',
    en: 'This screen is shown only after admin permissions and operating policy are confirmed.',
  },
  'route.loading.description': {
    ko: '권한과 운영 정책을 확인한 뒤 화면을 표시합니다.',
    en: 'The screen appears after permissions and operating policy are checked.',
  },
  'route.loading.cardTitle': { ko: '접근 상태 확인', en: 'Checking access state' },
  'route.loading.cardMeta': { ko: '권한 확인 중', en: 'Permission check in progress' },
  'route.loading.title': { ko: '접근 상태 확인 중', en: 'Checking access state' },
  'route.loading.descriptionLong': {
    ko: '관리자 화면은 계정 권한이 확인되기 전까지 표시하지 않습니다.',
    en: 'Admin screens stay hidden until account permissions are confirmed.',
  },
  'route.area.launch': { ko: '운영자 도구', en: 'Operator tools' },
  'route.area.scale': { ko: '시스템 상태', en: 'System health' },
  'route.area.contracts': { ko: '계약 검토', en: 'Contract review' },
  'route.area.dd': { ko: '실사 자료', en: 'Diligence' },
  'route.area.litigation': { ko: '소송 자료', en: 'Litigation' },
  'route.area.enterprise': { ko: '관리자 설정', en: 'Admin settings' },
  'route.area.admin': { ko: '관리자 설정', en: 'Admin settings' },
  'route.area.adminSecurity': { ko: '보안 설정', en: 'Security settings' },
  'files.page.title': { ko: '문서함', en: 'Document vault' },
  'files.page.description': {
    ko: '접근 권한이 확인된 전체 문서와 Matter별 업로드 흐름을 한곳에서 관리합니다.',
    en: 'Review authorized documents and matter-scoped upload flow in one place.',
  },
  'files.section.title': { ko: '전체 문서', en: 'All documents' },
  'files.section.meta': { ko: '권한으로 보호됨', en: 'Permission scoped' },
  'files.empty.title': {
    ko: '파일 목록을 표시할 수 없습니다.',
    en: 'The file list cannot be displayed.',
  },
  'integrations.page.title': { ko: '통합', en: 'Integrations' },
  'integrations.page.description': {
    ko: '연결 상태 API가 확인된 통합만 표시합니다.',
    en: 'Only integrations confirmed by status APIs are shown.',
  },
  'integrations.section.title': { ko: '통합 상태', en: 'Integration status' },
  'integrations.section.meta': { ko: '운영 데이터 미연결', en: 'Operational data not connected' },
  'search.title': { ko: '문서 검색', en: 'Document search' },
  'search.label': { ko: '문서 검색', en: 'Document search' },
  'search.placeholder': {
    ko: '계약서, 사건, 키워드 검색',
    en: 'Search contracts, matters, or keywords',
  },
  'search.submit': { ko: '검색 실행', en: 'Run search' },
  'search.loading': { ko: '검색 결과를 불러오는 중입니다.', en: 'Loading results.' },
  'search.start': {
    ko: '검색어를 입력하면 접근 권한이 있는 파일만 보여줍니다.',
    en: 'Enter a search term to see files you can access.',
  },
  'search.empty': { ko: '검색 결과가 없습니다.', en: 'No results.' },
  'search.auth': { ko: '로그인이 필요합니다.', en: 'Sign in required.' },
  'search.permission': {
    ko: '이 항목을 볼 권한이 없습니다.',
    en: 'You do not have permission to view this item.',
  },
  'search.policy': {
    ko: '정보 차단 또는 권한 정책으로 표시할 수 없습니다.',
    en: 'Information barrier or permission policy prevents display.',
  },
  'search.api': { ko: '데이터를 표시할 수 없습니다.', en: 'Unable to display data.' },
  'search.previous': { ko: '이전', en: 'Previous' },
  'search.next': { ko: '다음', en: 'Next' },
  'search.facet.type': { ko: '파일 유형', en: 'File type' },
  'search.facet.version': { ko: '버전 상태', en: 'Version status' },
  'search.facet.matter': { ko: '사건', en: 'Matter' },
  'search.facet.client': { ko: '고객', en: 'Client' },
  'search.facet.updated': { ko: '수정일', en: 'Updated' },
  'search.facet.searchability': { ko: '추출/OCR', en: 'Extraction/OCR' },
  'search.facet.confidentiality': { ko: '기밀도', en: 'Confidentiality' },
  'search.facet.privilege': { ko: '특권 상태', en: 'Privilege status' },
  'search.facet.legalHold': { ko: '보존/삭제 금지', en: 'Legal hold' },
  'search.facet.recordsStatus': { ko: '기록 상태', en: 'Records status' },
  'search.facet.clear': { ko: '필터 초기화', en: 'Clear filters' },
  'search.facet.unavailable': {
    ko: '표시 가능한 라벨 없음',
    en: 'No display label available',
  },
  'search.facet.contract': { ko: '계약서', en: 'Contract' },
  'search.facet.memo': { ko: '메모', en: 'Memo' },
  'search.facet.current': { ko: '최신 버전', en: 'Current' },
  'search.facet.superseded': { ko: '이전 버전', en: 'Superseded' },
  'search.facet.confidentialityStandard': { ko: '표준', en: 'Standard' },
  'search.facet.confidentialityHigh': { ko: '높음', en: 'High' },
  'search.facet.confidentialityRestricted': { ko: '제한', en: 'Restricted' },
  'search.facet.privilegeNone': { ko: '특권 없음', en: 'No privilege' },
  'search.facet.privileged': { ko: '변호사-의뢰인 특권', en: 'Attorney-client privilege' },
  'search.facet.workProduct': { ko: '작업 산출물', en: 'Work product' },
  'search.facet.jointPrivilege': { ko: '공동 특권', en: 'Joint privilege' },
  'search.facet.extractionReady': { ko: '본문 검색 가능', en: 'Body searchable' },
  'search.facet.extractionPending': { ko: '추출 대기', en: 'Extraction pending' },
  'search.facet.extractionOcrPending': { ko: 'OCR 필요', en: 'OCR required' },
  'search.facet.extractionFailed': { ko: '추출 실패', en: 'Extraction failed' },
  'search.facet.documentHold': { ko: '파일 삭제 금지', en: 'File hold' },
  'search.facet.matterHold': { ko: 'Matter 삭제 금지', en: 'Matter hold' },
  'search.facet.noHold': { ko: '보존 조치 없음', en: 'No hold' },
  'search.facet.recordsActive': { ko: '운영 중', en: 'Active' },
  'search.facet.recordsArchived': { ko: '보관됨', en: 'Archived' },
  'search.facet.recordsDisposalLocked': { ko: '처분 잠금', en: 'Disposal locked' },
  'search.facet.last7Days': { ko: '최근 7일', en: 'Last 7 days' },
  'search.facet.last30Days': { ko: '최근 30일', en: 'Last 30 days' },
  'search.facet.older': { ko: '30일 이전', en: 'Older' },
  'search.result.hiddenTitle': {
    ko: '표시 가능한 제목 없음',
    en: 'No display title available',
  },
  'outlook.page.title': { ko: 'Outlook 통합', en: 'Outlook integration' },
  'outlook.page.description': {
    ko: 'Office 작업 창과 별도로, 관리자용 연결 상태만 표시합니다.',
    en: 'Shows admin connection status separately from the Office task pane.',
  },
  'outlook.section.statusTitle': { ko: 'Outlook 운영 상태', en: 'Outlook operational status' },
  'outlook.section.statusMeta': { ko: '상태 API 기준', en: 'Status API source' },
  'outlook.loading.title': {
    ko: 'Outlook 운영 상태를 불러오는 중입니다.',
    en: 'Loading Outlook operational status.',
  },
  'outlook.loading.description': {
    ko: '상태 API 응답 전에는 연결 여부나 배포 상태를 표시하지 않습니다.',
    en: 'Connection and rollout status are hidden until the status API responds.',
  },
  'outlook.error.title': {
    ko: 'Outlook 운영 상태를 표시할 수 없습니다.',
    en: 'Unable to display Outlook operational status.',
  },
  'outlook.error.description': {
    ko: '권한 또는 상태 API 연결을 확인해 주세요.',
    en: 'Check permissions or the status API connection.',
  },
  'outlook.gate.title': { ko: '운영 게이트', en: 'Operational gate' },
  'outlook.gate.meta': { ko: 'API 응답 기준', en: 'API response source' },
  'outlook.gate.enforced': { ko: '게이트 적용', en: 'Gate enforcement' },
  'outlook.gate.rolloutRing': { ko: '출시 단계', en: 'Rollout ring' },
  'outlook.gate.auditAvailability': { ko: '감사 기록 상태', en: 'Audit availability' },
  'outlook.status.enforced': { ko: '적용 중', en: 'Enforced' },
  'outlook.status.devMode': { ko: '개발 모드', en: 'Development mode' },
  'outlook.status.unset': { ko: '설정되지 않음', en: 'Not configured' },
  'outlook.status.confirmed': { ko: '확인됨', en: 'Confirmed' },
  'outlook.status.unconfirmed': { ko: '미확인', en: 'Unconfirmed' },
  'outlook.evidence.title': { ko: '증적 상태', en: 'Evidence status' },
  'outlook.evidence.meta': { ko: '참조값 원문 비노출', en: 'Reference values hidden' },
  'outlook.evidence.manifest': { ko: 'Manifest 검증', en: 'Manifest validation' },
  'outlook.evidence.graphConsent': { ko: 'Graph 동의 검증', en: 'Graph consent validation' },
  'outlook.evidence.operatorApproval': { ko: '운영 승인', en: 'Operator approval' },
  'outlook.evidence.rollbackRehearsal': { ko: '비활성화 리허설', en: 'Disable/remove rehearsal' },
  'outlook.evidence.valid': { ko: '형식 확인', en: 'Format verified' },
  'outlook.evidence.invalid': { ko: '형식 확인 필요', en: 'Format review needed' },
  'outlook.evidence.missing': { ko: '미제출', en: 'Missing' },
  'outlook.features.title': { ko: '기능별 운영 상태', en: 'Feature operational status' },
  'outlook.features.meta': { ko: '기능 플래그 및 게이트 판단', en: 'Feature flags and gate decisions' },
  'outlook.features.caption': { ko: 'Outlook 기능별 운영 상태', en: 'Outlook feature operational status' },
  'outlook.features.feature': { ko: '기능', en: 'Feature' },
  'outlook.features.configuration': { ko: '설정', en: 'Configuration' },
  'outlook.features.gate': { ko: '게이트', en: 'Gate' },
  'outlook.features.reason': { ko: '차단 사유', en: 'Block reason' },
  'outlook.features.enabled': { ko: '활성화', en: 'Enabled' },
  'outlook.features.disabled': { ko: '비활성', en: 'Disabled' },
  'outlook.features.allowed': { ko: '허용', en: 'Allowed' },
  'outlook.features.blocked': { ko: '차단', en: 'Blocked' },
  'outlook.features.noReason': { ko: '없음', en: 'None' },
  'outlook.features.policyReview': { ko: '정책 확인 필요', en: 'Policy review needed' },
  'outlook.feature.addinBootstrap': { ko: 'Add-in 시작', en: 'Add-in bootstrap' },
  'outlook.feature.authExchange': { ko: '인증 교환', en: 'Authentication exchange' },
  'outlook.feature.graphAttachment': { ko: 'Graph 첨부 획득', en: 'Graph attachment acquisition' },
  'outlook.feature.smartAlerts': { ko: '스마트 알림', en: 'Smart Alerts' },
  'outlook.feature.sendFile': { ko: '전송 및 보관', en: 'Send and file' },
  'outlook.feature.documentInsertion': { ko: 'Vault 문서 삽입', en: 'Vault document insertion' },
  'outlook.feature.folderMapping': { ko: '폴더 매핑', en: 'Folder mapping' },
  'outlook.feature.autofile': { ko: '자동 파일링', en: 'Auto-file' },
  'outlook.feature.unknown': { ko: '기능 정보 없음', en: 'Feature not displayable' },
  'outlook.reason.auditUnavailable': { ko: '감사 기록을 확인할 수 없음', en: 'Audit unavailable' },
  'outlook.reason.globalDisabled': { ko: '통합이 전역 비활성화됨', en: 'Integration globally disabled' },
  'outlook.reason.featureDisabled': { ko: '기능 플래그 비활성', en: 'Feature disabled' },
  'outlook.reason.ringNotAllowed': { ko: '현재 출시 단계에서 차단됨', en: 'Not allowed in this rollout ring' },
  'outlook.reason.missingEvidence': { ko: '필수 증적 없음', en: 'Required evidence missing' },
  'outlook.reason.malformedEvidence': { ko: '증적 형식 확인 필요', en: 'Evidence format review needed' },
  'outlook.reason.graphConsentMissing': { ko: 'Graph 동의 증적 없음', en: 'Graph consent evidence missing' },
  'outlook.reason.manifestMissing': { ko: 'Manifest 검증 증적 없음', en: 'Manifest validation evidence missing' },
  'outlook.reason.operatorApprovalMissing': { ko: '운영 승인 증적 없음', en: 'Operator approval evidence missing' },
  'outlook.reason.rollbackMissing': { ko: '비활성화 리허설 증적 없음', en: 'Disable/remove rehearsal evidence missing' },
  'outlook.reason.unknownFeature': { ko: '알 수 없는 기능', en: 'Unknown feature' },
  'outlook.reason.unknownRing': { ko: '알 수 없는 출시 단계', en: 'Unknown rollout ring' },
  'matter.term': { ko: 'Matter', en: 'Matter' },
  'matter.list.title': { ko: 'Matter 목록', en: 'Matter list' },
  'matter.list.description': {
    ko: 'Matter app에서 동기화되고 접근 권한이 확인된 Matter만 표시됩니다.',
    en: 'Only matters confirmed by access permissions are shown.',
  },
  'matter.list.scoped': { ko: '권한으로 보호됨', en: 'Permissions applied' },
  'matter.list.empty': { ko: '표시할 Matter가 없습니다.', en: 'No matters to show.' },
  'matter.list.loading': { ko: 'Matter 목록을 불러오는 중입니다.', en: 'Loading matters.' },
  'matter.detail.fallbackTitle': { ko: 'Matter', en: 'Matter' },
  'matter.detail.descriptionLoading': {
    ko: '권한이 확인된 Matter 정보만 표시됩니다.',
    en: 'Only matter details confirmed by access permissions are shown.',
  },
  'matter.detail.errorTitle': { ko: 'Matter를 표시할 수 없습니다.', en: 'Unable to display matter.' },
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

export function formatSearchResultCount(total: number, language: Language): string {
  return language === 'ko' ? `결과 ${total}개` : `${total} results`;
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
      className="relative inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-background text-xs font-semibold text-foreground shadow-sm"
    >
      <select
        aria-label={t('language.label')}
        className="h-full appearance-none rounded-md bg-transparent py-0 pl-3 pr-8 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="ko">{t('language.korean')}</option>
        <option value="en">{t('language.english')}</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
