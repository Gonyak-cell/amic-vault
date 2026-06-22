import { Injectable } from '@nestjs/common';
import type {
  DocumentPermissionService,
  PermissionContext,
  PermissionDecision,
} from '@amic-vault/shared';
import { denyPermission } from '@amic-vault/shared';

@Injectable()
export class DocumentPermissionStub implements DocumentPermissionService {
  async canReadDocument(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canDownloadDocument(
    ctx: PermissionContext,
    documentId: string,
    reason?: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    void reason;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canCheckoutDocument(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canSaveDocumentSubversion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canReadDocumentSubversion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canCheckInDocument(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }

  async canPromoteDocumentVersion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    void ctx;
    void documentId;
    return denyPermission('NOT_IMPLEMENTED', ['document_permission:r1_stub']);
  }
}
