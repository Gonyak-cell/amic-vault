import type { ErrorCode } from '@amic-vault/shared';

export interface RetrievalRequest {
  tenantId: string;
  userId: string;
  matterId: string;
  query: string;
}

export interface RetrievalResult {
  status: 'not-implemented-before-r6';
  deniedCode?: ErrorCode;
}

export interface RetrievalOrchestrator {
  /**
   * R6에서만 구현한다. R6 전에는 인터페이스 placeholder 외 구현 코드 추가 금지.
   */
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}
