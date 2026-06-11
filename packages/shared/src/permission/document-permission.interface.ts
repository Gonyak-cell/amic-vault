import type { PermissionDecision } from './permission-decision';

export interface PermissionContext {
  tenantId: string;
  userId: string;
  sessionId?: string;
}

export interface DocumentPermissionService {
  /**
   * Freeze-target signature. R2 implementation evaluates matter permission,
   * document confidentiality, explicit permissions, and ethical walls.
   */
  canReadDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision>;

  /**
   * Freeze-target signature. R2 download policy will validate reason length
   * and audit reason references; R1 stubs must never allow downloads.
   */
  canDownloadDocument(
    ctx: PermissionContext,
    documentId: string,
    reason?: string,
  ): Promise<PermissionDecision>;
}

