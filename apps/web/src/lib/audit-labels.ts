import type { Language } from '@/lib/i18n';

const auditCategoryLabels: Record<string, string> = {
  ACCOUNT: '계정',
  ADVANCED: '고급 AI',
  AI: 'AI',
  AUDIT: '감사',
  BACKUP: '백업',
  BREAK: '긴급 접근',
  BYOK: '암호화 키',
  CLAUSE: '조항 라이브러리',
  CLIENT: '고객',
  CLOSING: '종결 문서철',
  COMPLIANCE: '준수 증빙',
  CONFLICT: '이해상충',
  CONTRACT: '계약',
  DD: '실사',
  DISPOSAL: '처분',
  DLP: '반출 방지',
  DOCUMENT: '문서',
  EMAIL: '이메일',
  ENTERPRISE: '엔터프라이즈 설정',
  ETHICAL: '정보 차단',
  EXTERNAL: '외부 공유',
  FACT: '사실관계',
  FILE: '파일',
  GRAPH: '관계도',
  KNOWLEDGE: '지식',
  LEGAL: '보존 조치',
  LIT: '송무',
  LOGIN: '로그인',
  MATTER: 'Matter',
  MFA: '다단계 인증',
  NEGOTIATION: '협상',
  OUTLOOK: 'Outlook',
  PARTY: '이해관계자',
  PERMISSION: '권한',
  PLAYBOOK: '계약 기준',
  RECORD: '기록',
  RETENTION: '보존 정책',
  ROLE: '역할',
  SAVED: '저장 항목',
  SCALE: '운영 성능',
  SEARCH: '검색',
  SESSION: '세션',
  SIEM: '보안 이벤트 연동',
  SSO: '통합 로그인',
  USER: '사용자',
  WIKI: '위키',
  WORK: '업무 항목',
};

const auditOperationLabels: Record<string, string> = {
  ACCEPTED: '승인',
  ACCESSED: '접근',
  ACTIVATED: '활성화',
  ADDED: '추가',
  APPLIED: '적용',
  APPROVED: '승인',
  ARCHIVED: '보관',
  ASSIGNED: '배정',
  BLOCKED: '차단',
  CANCELLED: '취소',
  CHANGED: '변경',
  CHECKED: '확인',
  COMPLETED: '완료',
  CONFIRMED: '확정',
  CREATED: '생성',
  DEACTIVATED: '비활성화',
  DELETED: '삭제',
  DENIED: '거부',
  DOWNLOADED: '다운로드',
  ENROLLED: '등록',
  EVALUATED: '평가',
  EXCHANGED: '교환',
  EXCLUDED: '제외',
  EXECUTED: '실행',
  EXPIRED: '만료',
  EXPORTED: '내보내기',
  EXTRACTED: '추출',
  FAILED: '실패',
  FILED: '보관',
  FINALIZED: '확정',
  HELD: '보류',
  IMPORTED: '가져오기',
  MAPPED: '연결',
  MARKED: '표시',
  MOVED: '이동',
  PARSED: '분석',
  PROMOTED: '승격',
  PROPOSED: '제안',
  QUARANTINED: '격리',
  REACTIVATED: '재활성화',
  REASSIGNED: '재배정',
  RECORDED: '기록',
  REJECTED: '반려',
  RELEASED: '해제',
  REMOVED: '제거',
  RENAMED: '이름 변경',
  REORDERED: '순서 변경',
  REQUESTED: '요청',
  RESOLVED: '해결',
  RESTORED: '복원',
  RETRIED: '재시도',
  REVERTED: '되돌리기',
  REVIEWED: '검토',
  REVOKED: '회수',
  SAVED: '저장',
  SCHEDULED: '예약',
  SUBMITTED: '제출',
  SUCCEEDED: '성공',
  SYNCED: '동기화',
  UPDATED: '수정',
  UPLOADED: '업로드',
  USED: '사용',
  VIEWED: '조회',
  WAIVED: '예외 처리',
};

export function auditActionLabel(value: string, language: Language): string {
  if (language === 'en') {
    return value
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ');
  }

  const tokens = value.toUpperCase().split('_').filter(Boolean);
  const category = tokens.map((token) => auditCategoryLabels[token]).find(Boolean) ?? '기타';
  const operation =
    [...tokens]
      .reverse()
      .map((token) => auditOperationLabels[token])
      .find(Boolean) ?? '활동';
  return `${category} ${operation}`;
}
