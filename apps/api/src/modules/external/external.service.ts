import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import {
  externalAccessManifestSchema,
  externalAccessStatusResponseSchema,
  externalDownloadTicketSchema,
  externalLinkCreatedResponseSchema,
  externalLinkSchema,
  externalNdaAcceptanceSchema,
  externalQaListResponseSchema,
  externalQaMessageSchema,
  externalUserSchema,
  externalWorkspaceSchema,
  type AcceptExternalNdaRequestDto,
  type CreateExternalAnswerRequestDto,
  type CreateExternalLinkRequestDto,
  type CreateExternalQuestionRequestDto,
  type CreateExternalUserRequestDto,
  type CreateExternalWorkspaceRequestDto,
  type DlpDetection,
  type ExternalAccessManifestDto,
  type ExternalAccessStatusResponseDto,
  type ExternalDownloadTicketDto,
  type ExternalLinkCreatedResponseDto,
  type ExternalLinkDto,
  type ExternalNdaAcceptanceDto,
  type ExternalQaListResponseDto,
  type ExternalQaMessageDto,
  type ExternalUserDto,
  type ExternalWorkspaceDto,
  type PermissionContext,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { DlpService } from '../dlp/dlp.service';
import { DocumentPermissionService } from '../permission/document-permission.service';
import { PermissionService } from '../permission/permission.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface WorkspaceRow {
  workspace_id: string;
  matter_id: string;
  workspace_code: string;
  display_ref: string;
  status: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface ExternalUserRow {
  external_user_id: string;
  email_hash: string;
  display_ref: string | null;
  status: string;
  workspace_id: string;
  created_at: Date;
  updated_at: Date;
}

interface LinkRow {
  link_id: string;
  tenant_id: string;
  workspace_id: string;
  external_user_id: string;
  document_id: string;
  version_id: string | null;
  status: string;
  expires_at: Date;
  nda_required: boolean;
  watermark_required: boolean;
  dlp_warning_status: string;
  dlp_result_hash: string | null;
  dlp_finding_count: number;
  dlp_override_reason_code: string | null;
  created_at: Date;
  updated_at: Date;
  matter_id: string;
  workspace_status: string;
  external_user_status: string;
  membership_status: string;
  document_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
}

interface QaMessageRow {
  qa_message_id: string;
  workspace_id: string;
  link_id: string;
  external_user_id: string;
  parent_message_id: string | null;
  direction: string;
  message_text: string;
  message_hash: string;
  created_at: Date;
  matter_id: string;
  document_id: string;
  version_id: string | null;
  expires_at: Date;
}

interface DlpTextRow {
  scan_text: string;
}

interface ExternalDlpEvaluation {
  findingCount: number;
  resultHash: string | null;
}

interface ExternalQaAuditScope {
  tenant_id: string;
  matter_id: string;
  workspace_id: string;
  external_user_id: string;
  link_id: string;
  document_id: string;
  version_id: string | null;
}

interface DocumentTargetRow {
  matter_id: string;
  document_id: string;
  version_id: string | null;
  document_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
}

interface ActorRoleRow {
  role: string;
  status: string;
}

interface MatterMemberRoleRow {
  matter_role: string;
  access_level: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function linkExpired(): GoneException {
  return new GoneException({ code: 'EXTERNAL_LINK_EXPIRED' });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function newLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

function assertFuture(iso: string, reason: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf()) || date.getTime() <= Date.now()) {
    throw validationFailed(reason);
  }
  return date;
}

function iso(value: Date): string {
  return value.toISOString();
}

function mapWorkspace(row: WorkspaceRow): ExternalWorkspaceDto {
  return externalWorkspaceSchema.parse({
    workspaceId: row.workspace_id,
    matterId: row.matter_id,
    workspaceCode: row.workspace_code,
    displayRef: row.display_ref,
    status: row.status,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function mapExternalUser(row: ExternalUserRow): ExternalUserDto {
  return externalUserSchema.parse({
    externalUserId: row.external_user_id,
    emailHash: row.email_hash,
    displayRef: row.display_ref,
    status: row.status,
    workspaceId: row.workspace_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function mapLink(row: Pick<
  LinkRow,
  | 'link_id'
  | 'workspace_id'
  | 'external_user_id'
  | 'document_id'
  | 'version_id'
  | 'status'
  | 'expires_at'
  | 'nda_required'
  | 'watermark_required'
  | 'dlp_warning_status'
  | 'created_at'
  | 'updated_at'
>): ExternalLinkDto {
  return externalLinkSchema.parse({
    linkId: row.link_id,
    workspaceId: row.workspace_id,
    externalUserId: row.external_user_id,
    documentId: row.document_id,
    versionId: row.version_id,
    status: row.status,
    expiresAt: iso(row.expires_at),
    ndaRequired: row.nda_required,
    watermarkRequired: row.watermark_required,
    dlpWarningStatus: row.dlp_warning_status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function mapQaMessage(row: QaMessageRow): ExternalQaMessageDto {
  return externalQaMessageSchema.parse({
    messageId: row.qa_message_id,
    workspaceId: row.workspace_id,
    linkId: row.link_id,
    externalUserId: row.external_user_id,
    parentMessageId: row.parent_message_id,
    direction: row.direction,
    messageText: row.message_text,
    messageHash: row.message_hash,
    createdAt: iso(row.created_at),
  });
}

function dlpScanHash(detections: readonly DlpDetection[]): string {
  return sha256Hex(detections.map((item) => `${item.ruleId}:${item.valueHash}`).join('|'));
}

function watermarkRefFor(link: LinkRow): string {
  return `watermark:${link.link_id}:${link.external_user_id}`;
}

function downloadRefFor(link: LinkRow): string {
  return `download:${link.link_id}:${randomBytes(16).toString('hex')}`;
}

@Injectable()
export class ExternalService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(DocumentPermissionService)
    private readonly documentPermissionService: DocumentPermissionService,
    @Inject(DlpService) private readonly dlpService: DlpService,
  ) {}

  async createWorkspace(
    ctx: PermissionContext,
    input: CreateExternalWorkspaceRequestDto,
  ): Promise<ExternalWorkspaceDto> {
    const expiresAt = assertFuture(input.expiresAt, 'EXTERNAL_WORKSPACE_EXPIRY_NOT_FUTURE');
    await this.assertCanManageExternalMatter(ctx, input.matterId);
    await this.assertSharingPoliciesEnabled(ctx.tenantId);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<WorkspaceRow>(
        `
          INSERT INTO external_workspaces (
            tenant_id, matter_id, workspace_code, display_ref, expires_at, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING workspace_id, matter_id, workspace_code, display_ref, status,
            expires_at, created_at, updated_at
        `,
        [
          ctx.tenantId,
          input.matterId,
          input.workspaceCode,
          input.displayRef,
          expiresAt,
          ctx.userId,
        ],
      );
      const workspace = mapWorkspace(requiredRow(result.rows[0]));
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'EXTERNAL_WORKSPACE_CHANGED',
          targetType: 'external_workspace',
          targetId: workspace.workspaceId,
          matterId: workspace.matterId,
          metadata: {
            matter_id: workspace.matterId,
            external_workspace_id: workspace.workspaceId,
            status_after: workspace.status,
            expires_at: workspace.expiresAt,
          },
        },
        client,
      );
      return workspace;
    });
  }

  async createExternalUser(
    ctx: PermissionContext,
    input: CreateExternalUserRequestDto,
  ): Promise<ExternalUserDto> {
    const workspace = await this.findWorkspace(ctx.tenantId, input.workspaceId);
    if (!workspace) throw notFoundDenied();
    await this.assertCanManageExternalMatter(ctx, workspace.matter_id);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const userResult = await client.query<{ external_user_id: string }>(
        `
          INSERT INTO external_users (
            tenant_id, email_hash, display_ref, status, created_by, updated_by
          )
          VALUES ($1, $2, $3, 'active', $4, $4)
          ON CONFLICT (tenant_id, email_hash)
          DO UPDATE SET
            display_ref = COALESCE(EXCLUDED.display_ref, external_users.display_ref),
            status = CASE
              WHEN external_users.status = 'revoked' THEN 'revoked'
              ELSE 'active'
            END,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
          RETURNING external_user_id
        `,
        [ctx.tenantId, input.emailHash, input.displayRef ?? null, ctx.userId],
      );
      const externalUserId = requiredRow(userResult.rows[0]).external_user_id;
      await client.query(
        `
          INSERT INTO external_workspace_members (
            tenant_id, workspace_id, external_user_id, status, created_by
          )
          VALUES ($1, $2, $3, 'active', $4)
          ON CONFLICT (tenant_id, workspace_id, external_user_id)
          DO UPDATE SET status = 'active', updated_at = now()
        `,
        [ctx.tenantId, input.workspaceId, externalUserId, ctx.userId],
      );
      const row = await this.findExternalUserForWorkspace(
        client,
        ctx.tenantId,
        input.workspaceId,
        externalUserId,
      );
      if (!row) throw validationFailed('EXTERNAL_USER_NOT_FOUND_AFTER_INSERT');
      const user = mapExternalUser(row);
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'EXTERNAL_USER_CHANGED',
          targetType: 'external_user',
          targetId: user.externalUserId,
          matterId: workspace.matter_id,
          metadata: {
            matter_id: workspace.matter_id,
            external_workspace_id: input.workspaceId,
            external_user_id: user.externalUserId,
            status_after: user.status,
          },
        },
        client,
      );
      return user;
    });
  }

  async createLink(
    ctx: PermissionContext,
    input: CreateExternalLinkRequestDto,
  ): Promise<ExternalLinkCreatedResponseDto> {
    const expiresAt = assertFuture(input.expiresAt, 'EXTERNAL_LINK_EXPIRY_NOT_FUTURE');
    const workspace = await this.findWorkspace(ctx.tenantId, input.workspaceId);
    if (!workspace) throw notFoundDenied();
    await this.assertCanManageExternalMatter(ctx, workspace.matter_id);
    await this.assertActiveWorkspace(ctx.tenantId, workspace.workspace_id);
    await this.assertWorkspaceMember(ctx.tenantId, input.workspaceId, input.externalUserId);
    await this.assertCanReadDocument(ctx, input.documentId);
    const target = await this.findDocumentTarget(ctx.tenantId, input.documentId, input.versionId);
    if (!target || target.matter_id !== workspace.matter_id) throw permissionDenied();
    if (target.document_status === 'deleted' || target.document_legal_hold || target.matter_legal_hold) {
      throw validationFailed('EXTERNAL_LINK_DOCUMENT_LOCKED');
    }
    const dlpEvaluation = await this.evaluateExternalDlp(ctx.tenantId, target);
    if (dlpEvaluation.findingCount > 0 && !input.dlpWarningAccepted) {
      await this.auditDlpWarningBlocked(ctx, workspace, input, target, dlpEvaluation);
      throw validationFailed('EXTERNAL_DLP_WARNING_REQUIRED');
    }
    if (dlpEvaluation.findingCount === 0 && input.dlpWarningAccepted) {
      throw validationFailed('EXTERNAL_DLP_WARNING_NOT_REQUIRED');
    }

    const linkToken = newLinkToken();
    const tokenHash = sha256Hex(linkToken);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<LinkRow>(
        `
          INSERT INTO external_secure_links (
            tenant_id, workspace_id, external_user_id, document_id, version_id,
            token_hash, expires_at, nda_required, watermark_required,
            dlp_warning_status, dlp_result_hash, dlp_finding_count, dlp_override_reason_code,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13)
          RETURNING link_id, tenant_id, workspace_id, external_user_id, document_id,
            version_id, status, expires_at, nda_required, watermark_required,
            dlp_warning_status, dlp_result_hash, dlp_finding_count, dlp_override_reason_code,
            created_at, updated_at,
            $14::uuid AS matter_id,
            'active' AS workspace_status,
            'active' AS external_user_status,
            'active' AS membership_status,
            'draft' AS document_status,
            false AS document_legal_hold,
            false AS matter_legal_hold
        `,
        [
          ctx.tenantId,
          input.workspaceId,
          input.externalUserId,
          input.documentId,
          target.version_id,
          tokenHash,
          expiresAt,
          input.watermarkRequired,
          dlpEvaluation.findingCount > 0 ? 'accepted' : 'not_required',
          dlpEvaluation.resultHash,
          dlpEvaluation.findingCount,
          input.dlpOverrideReasonCode ?? null,
          ctx.userId,
          workspace.matter_id,
        ],
      );
      const link = mapLink(requiredRow(result.rows[0]));
      if (dlpEvaluation.findingCount > 0) {
        await this.auditService.log(
          {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            sessionId: ctx.sessionId ?? null,
            action: 'EXTERNAL_DLP_WARNING_ACCEPTED',
            targetType: 'external_link',
            targetId: link.linkId,
            matterId: workspace.matter_id,
            metadata: {
              matter_id: workspace.matter_id,
              document_id: link.documentId,
              version_id: link.versionId,
              external_workspace_id: link.workspaceId,
              external_user_id: link.externalUserId,
              external_link_id: link.linkId,
              scope_type: 'external_link_dlp_warning',
              scope_id: link.versionId ?? link.documentId,
              result_count: dlpEvaluation.findingCount,
              hash: requiredDlpHash(dlpEvaluation),
              reason_code: input.dlpOverrideReasonCode ?? 'DLP_OVERRIDE_ACCEPTED',
            },
          },
          client,
        );
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'EXTERNAL_LINK_CREATED',
          targetType: 'external_link',
          targetId: link.linkId,
          matterId: workspace.matter_id,
          metadata: {
            matter_id: workspace.matter_id,
            document_id: link.documentId,
            version_id: link.versionId,
            external_workspace_id: link.workspaceId,
            external_user_id: link.externalUserId,
            external_link_id: link.linkId,
            expires_at: link.expiresAt,
            access_status: 'active',
          },
        },
        client,
      );
      return externalLinkCreatedResponseSchema.parse({ link, linkToken });
    });
  }

  async revokeLink(ctx: PermissionContext, linkId: string): Promise<ExternalLinkDto> {
    if (!uuidPattern.test(linkId)) throw notFoundDenied();
    const existing = await this.findLinkForAdmin(ctx.tenantId, linkId);
    if (!existing) throw notFoundDenied();
    await this.assertCanManageExternalMatter(ctx, existing.matter_id);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<LinkRow>(
        `
          UPDATE external_secure_links
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now()),
              revoked_by = COALESCE(revoked_by, $3),
              updated_at = now()
          WHERE tenant_id = $1
            AND link_id = $2
          RETURNING link_id, tenant_id, workspace_id, external_user_id, document_id,
            version_id, status, expires_at, nda_required, watermark_required,
            dlp_warning_status, dlp_result_hash, dlp_finding_count, dlp_override_reason_code,
            created_at, updated_at,
            $4::uuid AS matter_id,
            'active' AS workspace_status,
            'active' AS external_user_status,
            'active' AS membership_status,
            'draft' AS document_status,
            false AS document_legal_hold,
            false AS matter_legal_hold
        `,
        [ctx.tenantId, linkId, ctx.userId, existing.matter_id],
      );
      const link = mapLink(requiredRow(result.rows[0]));
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'EXTERNAL_LINK_REVOKED',
          targetType: 'external_link',
          targetId: link.linkId,
          matterId: existing.matter_id,
          result: 'success',
          metadata: {
            matter_id: existing.matter_id,
            document_id: link.documentId,
            external_workspace_id: link.workspaceId,
            external_user_id: link.externalUserId,
            external_link_id: link.linkId,
            status_after: link.status,
          },
        },
        client,
      );
      return link;
    });
  }

  async accessStatus(
    token: string,
    metadata: { actorRef: string | null },
  ): Promise<ExternalAccessStatusResponseDto> {
    const link = await this.resolveToken(token);
    const accepted = await this.hasNdaAcceptance(link);
    const response = externalAccessStatusResponseSchema.parse({
      status: accepted ? 'ready' : 'nda_required',
      ndaRequired: !accepted,
      expiresAt: iso(link.expires_at),
    });
    await this.auditService.transaction(link.tenant_id, async (client) => {
      await this.auditService.log(
        externalAccessAudit(link, accepted ? 'ready' : 'nda_required', metadata.actorRef),
        client,
      );
    });
    return response;
  }

  async acceptNda(
    token: string,
    input: AcceptExternalNdaRequestDto,
    metadata: { actorRef: string | null },
  ): Promise<ExternalNdaAcceptanceDto> {
    const link = await this.resolveToken(token);
    return this.auditService.transaction(link.tenant_id, async (client) => {
      const result = await client.query<{ nda_version: string; accepted_at: Date }>(
        `
          INSERT INTO external_nda_acceptances (
            tenant_id, link_id, external_user_id, nda_version, actor_ref_hash
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, link_id, external_user_id, nda_version)
          DO UPDATE SET accepted_at = external_nda_acceptances.accepted_at
          RETURNING nda_version, accepted_at
        `,
        [
          link.tenant_id,
          link.link_id,
          link.external_user_id,
          input.ndaVersion,
          metadata.actorRef ? sha256Hex(metadata.actorRef) : null,
        ],
      );
      const row = requiredRow(result.rows[0]);
      await this.auditService.log(
        {
          tenantId: link.tenant_id,
          actorType: 'system',
          actorId: null,
          action: 'EXTERNAL_NDA_ACCEPTED',
          targetType: 'external_link',
          targetId: link.link_id,
          matterId: link.matter_id,
          metadata: {
            matter_id: link.matter_id,
            document_id: link.document_id,
            external_workspace_id: link.workspace_id,
            external_user_id: link.external_user_id,
            external_link_id: link.link_id,
            nda_version: row.nda_version,
          },
        },
        client,
      );
      return externalNdaAcceptanceSchema.parse({
        accepted: true,
        ndaVersion: row.nda_version,
        acceptedAt: iso(row.accepted_at),
      });
    });
  }

  async manifest(
    token: string,
    metadata: { actorRef: string | null },
  ): Promise<ExternalAccessManifestDto> {
    const link = await this.resolveReadyToken(token);
    const watermarkRef = watermarkRefFor(link);
    return this.auditService.transaction(link.tenant_id, async (client) => {
      await client.query(
        `
          UPDATE external_secure_links
          SET access_count = access_count + 1,
              updated_at = now()
          WHERE tenant_id = $1
            AND link_id = $2
        `,
        [link.tenant_id, link.link_id],
      );
      await this.auditService.log(
        externalAccessAudit(link, 'ready', metadata.actorRef, watermarkRef),
        client,
      );
      return externalAccessManifestSchema.parse({
        status: 'ready',
        workspaceId: link.workspace_id,
        externalUserId: link.external_user_id,
        documentId: link.document_id,
        versionId: link.version_id,
        expiresAt: iso(link.expires_at),
        watermarkApplied: true,
        watermarkRef,
      });
    });
  }

  async downloadTicket(
    token: string,
    metadata: { actorRef: string | null },
  ): Promise<ExternalDownloadTicketDto> {
    const link = await this.resolveReadyToken(token);
    const watermarkRef = watermarkRefFor(link);
    const downloadRef = downloadRefFor(link);
    return this.auditService.transaction(link.tenant_id, async (client) => {
      await client.query(
        `
          UPDATE external_secure_links
          SET access_count = access_count + 1,
              updated_at = now()
          WHERE tenant_id = $1
            AND link_id = $2
        `,
        [link.tenant_id, link.link_id],
      );
      await this.auditService.log(
        {
          tenantId: link.tenant_id,
          actorType: 'system',
          actorId: null,
          action: 'EXTERNAL_DOWNLOAD_REQUESTED',
          targetType: 'external_link',
          targetId: link.link_id,
          matterId: link.matter_id,
          metadata: {
            matter_id: link.matter_id,
            document_id: link.document_id,
            version_id: link.version_id,
            external_workspace_id: link.workspace_id,
            external_user_id: link.external_user_id,
            external_link_id: link.link_id,
            access_status: 'download_ticket_issued',
            scope_type: 'download_ticket',
            scope_id: downloadRef,
            watermark_ref: watermarkRef,
            ...(metadata.actorRef ? { hash: sha256Hex(metadata.actorRef) } : {}),
          },
        },
        client,
      );
      return externalDownloadTicketSchema.parse({
        status: 'ready',
        workspaceId: link.workspace_id,
        externalUserId: link.external_user_id,
        documentId: link.document_id,
        versionId: link.version_id,
        expiresAt: iso(link.expires_at),
        watermarkApplied: true,
        watermarkRef,
        downloadRef,
      });
    });
  }

  async listQa(token: string): Promise<ExternalQaListResponseDto> {
    const link = await this.resolveReadyToken(token);
    const result = await getPool().query<QaMessageRow>(
      `
        SELECT q.qa_message_id, q.workspace_id, q.link_id, q.external_user_id,
          q.parent_message_id, q.direction, q.message_text, q.message_hash, q.created_at,
          w.matter_id, l.document_id, l.version_id, l.expires_at
        FROM external_qa_messages q
        JOIN external_secure_links l
          ON l.tenant_id = q.tenant_id
         AND l.link_id = q.link_id
        JOIN external_workspaces w
          ON w.tenant_id = q.tenant_id
         AND w.workspace_id = q.workspace_id
        WHERE q.tenant_id = $1
          AND q.link_id = $2
        ORDER BY q.created_at ASC, q.qa_message_id ASC
        LIMIT 200
      `,
      [link.tenant_id, link.link_id],
    );
    return externalQaListResponseSchema.parse({
      messages: result.rows.map(mapQaMessage),
    });
  }

  async createQuestion(
    token: string,
    input: CreateExternalQuestionRequestDto,
    metadata: { actorRef: string | null },
  ): Promise<ExternalQaMessageDto> {
    const link = await this.resolveReadyToken(token);
    const messageHash = sha256Hex(input.messageText);
    return this.auditService.transaction(link.tenant_id, async (client) => {
      const result = await client.query<QaMessageRow>(
        `
          INSERT INTO external_qa_messages (
            tenant_id, workspace_id, link_id, external_user_id, direction,
            message_text, message_hash, actor_ref_hash
          )
          VALUES ($1, $2, $3, $4, 'external_question', $5, $6, $7)
          RETURNING qa_message_id, workspace_id, link_id, external_user_id,
            parent_message_id, direction, message_text, message_hash, created_at
        `,
        [
          link.tenant_id,
          link.workspace_id,
          link.link_id,
          link.external_user_id,
          input.messageText,
          messageHash,
          metadata.actorRef ? sha256Hex(metadata.actorRef) : null,
        ],
      );
      const message = mapQaMessage(requiredRow(result.rows[0]));
      await this.auditService.log(
        externalQaAudit(link, message, 'external_question'),
        client,
      );
      return message;
    });
  }

  async listWorkspaceQa(
    ctx: PermissionContext,
    workspaceId: string,
  ): Promise<ExternalQaListResponseDto> {
    if (!uuidPattern.test(workspaceId)) throw notFoundDenied();
    const workspace = await this.findWorkspace(ctx.tenantId, workspaceId);
    if (!workspace) throw notFoundDenied();
    await this.assertCanManageExternalMatter(ctx, workspace.matter_id);
    const result = await getPool().query<QaMessageRow>(
      `
        SELECT q.qa_message_id, q.workspace_id, q.link_id, q.external_user_id,
          q.parent_message_id, q.direction, q.message_text, q.message_hash, q.created_at,
          w.matter_id, l.document_id, l.version_id, l.expires_at
        FROM external_qa_messages q
        JOIN external_secure_links l
          ON l.tenant_id = q.tenant_id
         AND l.link_id = q.link_id
        JOIN external_workspaces w
          ON w.tenant_id = q.tenant_id
         AND w.workspace_id = q.workspace_id
        WHERE q.tenant_id = $1
          AND q.workspace_id = $2
        ORDER BY q.created_at ASC, q.qa_message_id ASC
        LIMIT 200
      `,
      [ctx.tenantId, workspaceId],
    );
    return externalQaListResponseSchema.parse({
      messages: result.rows.map(mapQaMessage),
    });
  }

  async createAnswer(
    ctx: PermissionContext,
    messageId: string,
    input: CreateExternalAnswerRequestDto,
  ): Promise<ExternalQaMessageDto> {
    if (!uuidPattern.test(messageId)) throw notFoundDenied();
    const parent = await this.findQaMessageForAdmin(ctx.tenantId, messageId);
    if (!parent || !parent.matter_id) throw notFoundDenied();
    if (parent.direction !== 'external_question') {
      throw validationFailed('EXTERNAL_QA_PARENT_INVALID');
    }
    await this.assertCanManageExternalMatter(ctx, parent.matter_id);
    const messageHash = sha256Hex(input.messageText);
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query<QaMessageRow>(
        `
          INSERT INTO external_qa_messages (
            tenant_id, workspace_id, link_id, external_user_id, parent_message_id,
            direction, message_text, message_hash, created_by_internal_user_id
          )
          VALUES ($1, $2, $3, $4, $5, 'internal_answer', $6, $7, $8)
          RETURNING qa_message_id, workspace_id, link_id, external_user_id,
            parent_message_id, direction, message_text, message_hash, created_at
        `,
        [
          ctx.tenantId,
          parent.workspace_id,
          parent.link_id,
          parent.external_user_id,
          parent.qa_message_id,
          input.messageText,
          messageHash,
          ctx.userId,
        ],
      );
      const message = mapQaMessage(requiredRow(result.rows[0]));
      await this.auditService.log(
        {
          ...externalQaAudit(
            qaAuditScope(ctx.tenantId, parent),
            message,
            'internal_answer',
          ),
          actorType: 'user',
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
        },
        client,
      );
      return message;
    });
  }

  private async assertCanManageExternalMatter(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canEditMatter(ctx, matterId);
    if (decision.effect !== 'ALLOW') throw permissionDenied();
    const actor = await this.findActor(ctx.tenantId, ctx.userId);
    if (!actor || actor.status !== 'active') throw permissionDenied();
    if (actor.role === 'matter_owner') {
      const member = await this.findMatterMember(ctx.tenantId, matterId, ctx.userId);
      if (member?.matter_role !== 'owner') throw permissionDenied();
      return;
    }
    throw permissionDenied();
  }

  private async assertSharingPoliciesEnabled(tenantId: string): Promise<void> {
    const result = await getPool().query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM sharing_policy_definitions
        WHERE tenant_id = $1
          AND policy_key IN ('external_sharing', 'secure_link', 'external_user_access')
          AND status = 'enabled_r11'
          AND enforcement_mode = 'controlled_allow'
      `,
      [tenantId],
    );
    if (Number(result.rows[0]?.count ?? 0) !== 3) {
      throw permissionDenied();
    }
  }

  private async assertCanReadDocument(ctx: PermissionContext, documentId: string): Promise<void> {
    const decision = await this.documentPermissionService.canReadDocument(ctx, documentId);
    if (decision.effect !== 'ALLOW') throw permissionDenied();
  }

  private async resolveReadyToken(token: string): Promise<LinkRow> {
    const link = await this.resolveToken(token);
    if (!(await this.hasNdaAcceptance(link))) {
      throw permissionDenied();
    }
    return link;
  }

  private async evaluateExternalDlp(
    tenantId: string,
    target: DocumentTargetRow,
  ): Promise<ExternalDlpEvaluation> {
    const text = await this.findDocumentTextForDlp(
      tenantId,
      target.document_id,
      target.version_id,
    );
    if (!text) return { findingCount: 0, resultHash: null };
    const detections = this.dlpService.scanText(text);
    if (detections.length === 0) return { findingCount: 0, resultHash: null };
    return { findingCount: detections.length, resultHash: dlpScanHash(detections) };
  }

  private async auditDlpWarningBlocked(
    ctx: PermissionContext,
    workspace: { workspace_id: string; matter_id: string },
    input: CreateExternalLinkRequestDto,
    target: DocumentTargetRow,
    dlpEvaluation: ExternalDlpEvaluation,
  ): Promise<void> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId ?? null,
          action: 'EXTERNAL_DLP_WARNING_BLOCKED',
          targetType: 'document',
          targetId: target.document_id,
          matterId: workspace.matter_id,
          result: 'denied',
          metadata: {
            matter_id: workspace.matter_id,
            document_id: target.document_id,
            version_id: target.version_id,
            external_workspace_id: workspace.workspace_id,
            external_user_id: input.externalUserId,
            scope_type: 'external_link_dlp_warning',
            scope_id: target.version_id ?? target.document_id,
            result_count: dlpEvaluation.findingCount,
            hash: requiredDlpHash(dlpEvaluation),
            reason_code: 'EXTERNAL_DLP_WARNING_REQUIRED',
          },
        },
        client,
      );
    });
  }

  private async findDocumentTextForDlp(
    tenantId: string,
    documentId: string,
    versionId: string | null,
  ): Promise<string | null> {
    const canonical = await getPool().query<DlpTextRow>(
      `
        SELECT cd.body_text AS scan_text
        FROM canonical_documents cd
        JOIN document_versions v
          ON v.tenant_id = cd.tenant_id
         AND v.version_id = cd.version_id
        WHERE cd.tenant_id = $1
          AND v.document_id = $2
          AND ($3::uuid IS NULL OR v.version_id = $3::uuid)
          AND cd.extraction_status = 'ready'
          AND char_length(cd.body_text) > 0
        ORDER BY
          CASE WHEN v.version_status = 'current' THEN 0 ELSE 1 END,
          cd.updated_at DESC
        LIMIT 1
      `,
      [tenantId, documentId, versionId],
    );
    const canonicalText = canonical.rows[0]?.scan_text;
    if (canonicalText) return canonicalText;

    const indexed = await getPool().query<DlpTextRow>(
      `
        SELECT content_text AS scan_text
        FROM document_search_index
        WHERE tenant_id = $1
          AND document_id = $2
          AND ($3::uuid IS NULL OR version_id = $3::uuid)
          AND document_status <> 'deleted'
          AND version_status = 'current'
          AND char_length(content_text) > 0
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [tenantId, documentId, versionId],
    );
    return indexed.rows[0]?.scan_text ?? null;
  }

  private async assertActiveWorkspace(tenantId: string, workspaceId: string): Promise<void> {
    const result = await getPool().query<{ status: string; expires_at: Date }>(
      `
        SELECT status, expires_at
        FROM external_workspaces
        WHERE tenant_id = $1
          AND workspace_id = $2
        LIMIT 1
      `,
      [tenantId, workspaceId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active') throw permissionDenied();
    if (row.expires_at.getTime() <= Date.now()) throw linkExpired();
  }

  private async assertWorkspaceMember(
    tenantId: string,
    workspaceId: string,
    externalUserId: string,
  ): Promise<void> {
    const result = await getPool().query<{ status: string; user_status: string }>(
      `
        SELECT m.status, u.status AS user_status
        FROM external_workspace_members m
        JOIN external_users u
          ON u.tenant_id = m.tenant_id
         AND u.external_user_id = m.external_user_id
        WHERE m.tenant_id = $1
          AND m.workspace_id = $2
          AND m.external_user_id = $3
        LIMIT 1
      `,
      [tenantId, workspaceId, externalUserId],
    );
    const row = result.rows[0];
    if (!row || row.status !== 'active' || row.user_status !== 'active') {
      throw permissionDenied();
    }
  }

  private async findWorkspace(
    tenantId: string,
    workspaceId: string,
  ): Promise<{ workspace_id: string; matter_id: string } | null> {
    const result = await getPool().query<{ workspace_id: string; matter_id: string }>(
      `
        SELECT workspace_id, matter_id
        FROM external_workspaces
        WHERE tenant_id = $1
          AND workspace_id = $2
        LIMIT 1
      `,
      [tenantId, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  private async findExternalUserForWorkspace(
    client: PoolClient,
    tenantId: string,
    workspaceId: string,
    externalUserId: string,
  ): Promise<ExternalUserRow | null> {
    const result = await client.query<ExternalUserRow>(
      `
        SELECT u.external_user_id, u.email_hash, u.display_ref, u.status,
          m.workspace_id, u.created_at, u.updated_at
        FROM external_users u
        JOIN external_workspace_members m
          ON m.tenant_id = u.tenant_id
         AND m.external_user_id = u.external_user_id
        WHERE u.tenant_id = $1
          AND m.workspace_id = $2
          AND u.external_user_id = $3
        LIMIT 1
      `,
      [tenantId, workspaceId, externalUserId],
    );
    return result.rows[0] ?? null;
  }

  private async findDocumentTarget(
    tenantId: string,
    documentId: string,
    versionId?: string,
  ): Promise<DocumentTargetRow | null> {
    const result = await getPool().query<DocumentTargetRow>(
      `
        SELECT d.matter_id, d.document_id, $3::uuid AS version_id,
          d.status AS document_status,
          d.legal_hold AS document_legal_hold,
          m.legal_hold AS matter_legal_hold
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
         AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
          AND (
            $3::uuid IS NULL
            OR EXISTS (
              SELECT 1
              FROM document_versions v
              WHERE v.tenant_id = d.tenant_id
                AND v.document_id = d.document_id
                AND v.version_id = $3::uuid
            )
          )
        LIMIT 1
      `,
      [tenantId, documentId, versionId ?? null],
    );
    return result.rows[0] ?? null;
  }

  private async findLinkForAdmin(tenantId: string, linkId: string): Promise<LinkRow | null> {
    const result = await getPool().query<LinkRow>(
      `
        SELECT l.link_id, l.tenant_id, l.workspace_id, l.external_user_id,
          l.document_id, l.version_id, l.status, l.expires_at, l.nda_required,
          l.watermark_required, l.dlp_warning_status, l.dlp_result_hash,
          l.dlp_finding_count, l.dlp_override_reason_code, l.created_at, l.updated_at,
          w.matter_id, w.status AS workspace_status, u.status AS external_user_status,
          m.status AS membership_status, d.status AS document_status,
          d.legal_hold AS document_legal_hold, mt.legal_hold AS matter_legal_hold
        FROM external_secure_links l
        JOIN external_workspaces w
          ON w.tenant_id = l.tenant_id
         AND w.workspace_id = l.workspace_id
        JOIN external_workspace_members m
          ON m.tenant_id = l.tenant_id
         AND m.workspace_id = l.workspace_id
         AND m.external_user_id = l.external_user_id
        JOIN external_users u
          ON u.tenant_id = l.tenant_id
         AND u.external_user_id = l.external_user_id
        JOIN documents d
          ON d.tenant_id = l.tenant_id
         AND d.document_id = l.document_id
        JOIN matters mt
          ON mt.tenant_id = d.tenant_id
         AND mt.matter_id = d.matter_id
        WHERE l.tenant_id = $1
          AND l.link_id = $2
        LIMIT 1
      `,
      [tenantId, linkId],
    );
    return result.rows[0] ?? null;
  }

  private async findQaMessageForAdmin(
    tenantId: string,
    messageId: string,
  ): Promise<QaMessageRow | null> {
    const result = await getPool().query<QaMessageRow>(
      `
        SELECT q.qa_message_id, q.workspace_id, q.link_id, q.external_user_id,
          q.parent_message_id, q.direction, q.message_text, q.message_hash, q.created_at,
          w.matter_id, l.document_id, l.version_id, l.expires_at
        FROM external_qa_messages q
        JOIN external_secure_links l
          ON l.tenant_id = q.tenant_id
         AND l.link_id = q.link_id
        JOIN external_workspaces w
          ON w.tenant_id = q.tenant_id
         AND w.workspace_id = q.workspace_id
        WHERE q.tenant_id = $1
          AND q.qa_message_id = $2
        LIMIT 1
      `,
      [tenantId, messageId],
    );
    return result.rows[0] ?? null;
  }

  private async resolveToken(token: string): Promise<LinkRow> {
    const tokenHash = sha256Hex(token);
    const result = await getPool().query<LinkRow>(
      `
        SELECT l.link_id, l.tenant_id, l.workspace_id, l.external_user_id,
          l.document_id, l.version_id, l.status, l.expires_at, l.nda_required,
          l.watermark_required, l.dlp_warning_status, l.dlp_result_hash,
          l.dlp_finding_count, l.dlp_override_reason_code, l.created_at, l.updated_at,
          w.matter_id, w.status AS workspace_status, u.status AS external_user_status,
          m.status AS membership_status, d.status AS document_status,
          d.legal_hold AS document_legal_hold, mt.legal_hold AS matter_legal_hold
        FROM external_secure_links l
        JOIN external_workspaces w
          ON w.tenant_id = l.tenant_id
         AND w.workspace_id = l.workspace_id
        JOIN external_workspace_members m
          ON m.tenant_id = l.tenant_id
         AND m.workspace_id = l.workspace_id
         AND m.external_user_id = l.external_user_id
        JOIN external_users u
          ON u.tenant_id = l.tenant_id
         AND u.external_user_id = l.external_user_id
        JOIN documents d
          ON d.tenant_id = l.tenant_id
         AND d.document_id = l.document_id
        JOIN matters mt
          ON mt.tenant_id = d.tenant_id
         AND mt.matter_id = d.matter_id
        WHERE l.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );
    const link = result.rows[0];
    if (!link) throw permissionDenied();
    if (link.expires_at.getTime() <= Date.now()) throw linkExpired();
    if (
      link.status !== 'active' ||
      link.workspace_status !== 'active' ||
      link.external_user_status !== 'active' ||
      link.membership_status !== 'active'
    ) {
      throw permissionDenied();
    }
    if (link.document_status === 'deleted' || link.document_legal_hold || link.matter_legal_hold) {
      throw permissionDenied();
    }
    return link;
  }

  private async hasNdaAcceptance(link: LinkRow): Promise<boolean> {
    if (!link.nda_required) return true;
    const result = await getPool().query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM external_nda_acceptances
        WHERE tenant_id = $1
          AND link_id = $2
          AND external_user_id = $3
      `,
      [link.tenant_id, link.link_id, link.external_user_id],
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  private async findActor(tenantId: string, userId: string): Promise<ActorRoleRow | null> {
    const result = await getPool().query<ActorRoleRow>(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    return result.rows[0] ?? null;
  }

  private async findMatterMember(
    tenantId: string,
    matterId: string,
    userId: string,
  ): Promise<MatterMemberRoleRow | null> {
    const result = await getPool().query<MatterMemberRoleRow>(
      `
        SELECT matter_role, access_level
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, userId],
    );
    return result.rows[0] ?? null;
  }
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw validationFailed('ROW_NOT_FOUND');
  return row;
}

function requiredDlpHash(dlpEvaluation: ExternalDlpEvaluation): string {
  if (!dlpEvaluation.resultHash) throw validationFailed('DLP_RESULT_HASH_REQUIRED');
  return dlpEvaluation.resultHash;
}

function qaAuditScope(tenantId: string, row: QaMessageRow): ExternalQaAuditScope {
  return {
    tenant_id: tenantId,
    matter_id: row.matter_id,
    workspace_id: row.workspace_id,
    external_user_id: row.external_user_id,
    link_id: row.link_id,
    document_id: row.document_id,
    version_id: row.version_id,
  };
}

function externalAccessAudit(
  link: LinkRow,
  accessStatus: 'ready' | 'nda_required',
  actorRef: string | null,
  watermarkRef?: string,
) {
  return {
    tenantId: link.tenant_id,
    actorType: 'system' as const,
    actorId: null,
    action: 'EXTERNAL_LINK_ACCESSED' as const,
    targetType: 'external_link',
    targetId: link.link_id,
    matterId: link.matter_id,
    metadata: {
      matter_id: link.matter_id,
      document_id: link.document_id,
      version_id: link.version_id,
      external_workspace_id: link.workspace_id,
      external_user_id: link.external_user_id,
      external_link_id: link.link_id,
      access_status: accessStatus,
      expires_at: iso(link.expires_at),
      ...(watermarkRef ? { watermark_ref: watermarkRef } : {}),
      ...(actorRef ? { hash: sha256Hex(actorRef) } : {}),
    },
  };
}

function externalQaAudit(
  scope: ExternalQaAuditScope,
  message: ExternalQaMessageDto,
  direction: 'external_question' | 'internal_answer',
) {
  return {
    tenantId: scope.tenant_id,
    actorType: 'system' as const,
    actorId: null,
    action: 'EXTERNAL_QA_MESSAGE_RECORDED' as const,
    targetType: 'external_qa_message',
    targetId: message.messageId,
    matterId: scope.matter_id,
    metadata: {
      matter_id: scope.matter_id,
      document_id: scope.document_id,
      version_id: scope.version_id,
      external_workspace_id: scope.workspace_id,
      external_user_id: scope.external_user_id,
      external_link_id: scope.link_id,
      scope_type: 'external_qa_message',
      scope_id: message.messageId,
      hash: message.messageHash,
      access_status: direction,
      result_count: 1,
    },
  };
}
