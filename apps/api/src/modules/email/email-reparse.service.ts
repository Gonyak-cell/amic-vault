import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { type EmailMetadataWarningCode } from '@amic-vault/shared';
import type { PoolClient } from 'pg';
import type { Job, PgBoss, SendOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../common/process-role';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { emailMetadataUpdatedAudit } from '../audit/events/email-events';
import { pgBossDbFromPoolClient } from '../document/extraction/pool-client-db-adapter';
import { StorageService } from '../storage/storage.service';
import {
  classifyEmailParticipant,
  extractDomainRefsFromText,
  isOutsideParticipantClass,
  normalizeDomainRef,
  type ParticipantClassificationContext,
} from './participant-classifier';
import { emailWorkerParserVersion } from './email-parser-version';
import {
  EmailWorkerParserClient,
  type EmailWorkerParseResult,
  type EmailWorkerParticipantRole,
} from './email-worker-parser.client';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const emailReparseQueueName = 'email.reparse';
export const emailReparseDeadLetterQueueName = 'email.reparse.dead';

export interface EmailReparseJobPayload {
  tenantId: string;
  emailId: string;
  actorUserId?: string | null;
}

export interface EmailReparseResult {
  status: 'reparsed' | 'skipped';
  tenantId: string;
  emailId: string;
  parserVersionBefore?: string;
  parserVersionAfter?: string;
}

interface EmailReparseTargetRow {
  email_id: string;
  tenant_id: string;
  raw_file_object_id: string;
  message_id_hash: string;
  parser_version: string;
  raw_sha256: string;
  storage_uri: string;
  normalized_filename: string;
  mime_type: string;
  matter_id: string | null;
}

interface PreparedReparseParticipant {
  role: EmailWorkerParticipantRole;
  addressHash: string;
  domainRef: string;
  displayName: string | null;
  isOutside: boolean;
  participantClass: 'internal' | 'client' | 'opposing' | 'other_external';
}

interface PreparedReparseMetadata {
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  warningCode: EmailMetadataWarningCode | null;
  references: readonly string[];
  participants: readonly PreparedReparseParticipant[];
  hasOutsideParticipants: boolean;
}

export function isEmailReparseQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('EMAIL_REPARSE_QUEUE_WORKER_ENABLED', env);
}

export function emailReparseQueueSendOptions(emailId: string, client: PoolClient): SendOptions {
  return {
    singletonKey: emailId,
    retryLimit: 3,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: emailReparseDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function namespacedHash(namespace: string, value: string): string {
  return createHash('sha256').update(namespace).update('\0').update(value).digest('hex');
}

function messageIdHash(value: string): string {
  return namespacedHash('email-message-id', value);
}

@Injectable()
export class EmailReparseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailReparseService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(EmailWorkerParserClient) private readonly parserClient: EmailWorkerParserClient,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isEmailReparseQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueReparseBatch(
    input: { tenantId: string; limit?: number },
    client: PoolClient,
  ): Promise<string[]> {
    const limit = Number.isSafeInteger(input.limit) && input.limit && input.limit > 0 ? input.limit : 100;
    const candidates = await client.query<{ email_id: string }>(
      `
        SELECT email_id
        FROM email_messages
        WHERE tenant_id = $1
          AND parser_version <> $2
        ORDER BY created_at ASC, email_id ASC
        LIMIT $3
      `,
      [input.tenantId, emailWorkerParserVersion, limit],
    );
    const boss = await this.ensureStarted();
    const jobIds: string[] = [];
    for (const row of candidates.rows) {
      const jobId = await boss.send(
        emailReparseQueueName,
        { tenantId: input.tenantId, emailId: row.email_id },
        emailReparseQueueSendOptions(row.email_id, client),
      );
      if (!jobId) throw new Error('email reparse job enqueue returned no id');
      jobIds.push(jobId);
    }
    return jobIds;
  }

  async reparseEmail(payload: EmailReparseJobPayload): Promise<EmailReparseResult> {
    const target = await this.findTarget(payload);
    if (!target) return { status: 'skipped', tenantId: payload.tenantId, emailId: payload.emailId };
    const stored = await this.storageService.getByStorageUri(target.tenant_id, target.storage_uri);
    const parsed = await this.parserClient.parseRawEmail({
      tenantId: target.tenant_id,
      filename: target.normalized_filename,
      mimeType: target.mime_type,
      body: await streamToBuffer(stored.body),
    });
    await this.storeReparseResult(target, parsed, payload.actorUserId ?? null);
    return {
      status: 'reparsed',
      tenantId: target.tenant_id,
      emailId: target.email_id,
      parserVersionBefore: target.parser_version,
      parserVersionAfter: parsed.parserVersion,
    };
  }

  async markDeadLetter(payload: EmailReparseJobPayload): Promise<void> {
    this.logger.warn({ code: 'EMAIL_REPARSE_RETRY_EXHAUSTED', emailId: payload.emailId });
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await boss.work<EmailReparseJobPayload>(
      emailReparseQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.reparseEmail(job.data);
      },
    );
    await boss.work<EmailReparseJobPayload>(
      emailReparseDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.markDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= this.createStartedBoss();
    this.boss = await this.startPromise;
    return this.boss;
  }

  private async createStartedBoss(): Promise<PgBoss> {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: databaseUrl,
      ...pgBossRuntimeOptions({
        applicationName: 'amic-vault-email-reparse-queue',
        migrateEnvName: 'EMAIL_REPARSE_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'EMAIL_REPARSE_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'EMAIL_REPARSE_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'EMAIL_REPARSE_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(emailReparseDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(emailReparseQueueName, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: emailReparseDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }

  private async findTarget(payload: EmailReparseJobPayload): Promise<EmailReparseTargetRow | null> {
    return this.auditService.transaction(payload.tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT e.email_id, e.tenant_id, e.raw_file_object_id, e.message_id_hash,
            e.parser_version, e.raw_sha256, f.storage_uri, f.normalized_filename, f.mime_type,
            (
              SELECT filing.matter_id
              FROM email_matter_filings filing
              WHERE filing.tenant_id = e.tenant_id
                AND filing.email_id = e.email_id
              ORDER BY filing.created_at DESC, filing.filing_id DESC
              LIMIT 1
            ) AS matter_id
          FROM email_messages e
          JOIN file_objects f
            ON f.tenant_id = e.tenant_id
           AND f.file_object_id = e.raw_file_object_id
          WHERE e.tenant_id = $1
            AND e.email_id = $2
          LIMIT 1
        `,
        [payload.tenantId, payload.emailId],
      );
      return (result.rows[0] as EmailReparseTargetRow | undefined) ?? null;
    });
  }

  private prepareMetadata(
    parsed: EmailWorkerParseResult,
    context: ParticipantClassificationContext,
  ): PreparedReparseMetadata | null {
    if (parsed.parseStatus !== 'parsed') return null;
    const participants = parsed.participants.map((participant) => {
      const participantClass = classifyEmailParticipant({ domainRef: participant.domainRef }, context);
      return {
        role: participant.role,
        addressHash: namespacedHash('email-address', participant.normalizedAddress),
        domainRef: participant.domainRef,
        displayName: participant.displayName,
        isOutside: isOutsideParticipantClass(participantClass),
        participantClass,
      };
    });
    return {
      subject: parsed.subject,
      sentAt: parsed.sentAt,
      receivedAt: parsed.receivedAt,
      warningCode: parsed.metadataWarningCode,
      references: parsed.references.map((reference) => messageIdHash(reference)),
      participants,
      hasOutsideParticipants: participants.some((participant) => participant.isOutside),
    };
  }

  private async storeReparseResult(
    target: EmailReparseTargetRow,
    parsed: EmailWorkerParseResult,
    actorUserId: string | null,
  ): Promise<void> {
    await this.auditService.transaction(target.tenant_id, async (tx) => {
      const context = await this.loadParticipantClassificationContext(
        tx,
        target.tenant_id,
        target.matter_id,
      );
      const metadata = this.prepareMetadata(parsed, context);
      await tx.query(
        `
          UPDATE email_messages
          SET parser = $3,
            parser_version = $4,
            parse_status = $5,
            failure_reason_code = $6,
            subject = $7,
            sent_at = $8,
            received_at = $9,
            metadata_warning_code = $10,
            references_json = $11::jsonb,
            has_outside_participants = $12
          WHERE tenant_id = $1
            AND email_id = $2
            AND raw_file_object_id = $13
            AND message_id_hash = $14
        `,
        [
          target.tenant_id,
          target.email_id,
          parsed.parser,
          parsed.parserVersion,
          parsed.parseStatus,
          parsed.failureReasonCode,
          metadata?.subject ?? null,
          metadata?.sentAt ?? null,
          metadata?.receivedAt ?? null,
          metadata?.warningCode ?? null,
          JSON.stringify(metadata?.references ?? []),
          metadata?.hasOutsideParticipants ?? false,
          target.raw_file_object_id,
          target.message_id_hash,
        ],
      );
      await tx.query(
        `
          DELETE FROM email_participants
          WHERE tenant_id = $1
            AND email_id = $2
        `,
        [target.tenant_id, target.email_id],
      );
      await this.insertParticipants(tx, target.tenant_id, target.email_id, metadata);
      await this.auditService.log(
        emailMetadataUpdatedAudit({
          tenantId: target.tenant_id,
          actorId: actorUserId,
          emailId: target.email_id,
          participantCount: metadata?.participants.length ?? 0,
          warningCode: metadata?.warningCode ?? parsed.failureReasonCode,
          parserVersionBefore: target.parser_version,
          parserVersionAfter: parsed.parserVersion,
        }),
        tx,
      );
    });
  }

  private async insertParticipants(
    client: QueryClient,
    tenantId: string,
    emailId: string,
    metadata: PreparedReparseMetadata | null,
  ): Promise<void> {
    if (!metadata || metadata.participants.length === 0) return;
    for (const participant of metadata.participants) {
      await client.query(
        `
          INSERT INTO email_participants (
            tenant_id, email_id, role, address_hash, domain_ref, display_name,
            is_outside, participant_class
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, email_id, role, address_hash) DO UPDATE SET
            domain_ref = EXCLUDED.domain_ref,
            display_name = EXCLUDED.display_name,
            is_outside = EXCLUDED.is_outside,
            participant_class = EXCLUDED.participant_class
        `,
        [
          tenantId,
          emailId,
          participant.role,
          participant.addressHash,
          participant.domainRef,
          participant.displayName,
          participant.isOutside,
          participant.participantClass,
        ],
      );
    }
  }

  private async loadParticipantClassificationContext(
    client: QueryClient,
    tenantId: string,
    matterId: string | null,
  ): Promise<ParticipantClassificationContext> {
    const tenantDomainRows = await client.query(
      `
        SELECT domain_ref
        FROM tenant_email_domains
        WHERE tenant_id = $1
        ORDER BY domain_ref
      `,
      [tenantId],
    );
    const tenantDomains = new Set(
      (tenantDomainRows.rows as { domain_ref: string }[])
        .map((row) => normalizeDomainRef(row.domain_ref))
        .filter((domain): domain is string => domain !== null),
    );
    const clientDomains = new Set<string>();
    const opposingDomains = new Set<string>();
    if (!matterId) return { tenantDomains, clientDomains, opposingDomains };

    const matterDomainRows = await client.query(
      `
        SELECT nullif(lower(c.metadata_json->>'domain'), '') AS client_domain,
          nullif(lower(m.metadata_json->>'domain'), '') AS matter_domain
        FROM matters m
        JOIN clients c
          ON c.tenant_id = m.tenant_id
         AND c.client_id = m.client_id
        WHERE m.tenant_id = $1
          AND m.matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    for (const row of matterDomainRows.rows as Array<{
      client_domain: string | null;
      matter_domain: string | null;
    }>) {
      for (const value of [row.client_domain, row.matter_domain]) {
        const domain = normalizeDomainRef(value);
        if (domain) clientDomains.add(domain);
      }
    }

    const partyRows = await client.query(
      `
        SELECT p.name, p.party_role,
          nullif(lower(c.metadata_json->>'domain'), '') AS related_client_domain
        FROM parties p
        LEFT JOIN clients c
          ON c.tenant_id = p.tenant_id
         AND c.client_id = p.related_client_id
        WHERE p.tenant_id = $1
          AND p.matter_id = $2
      `,
      [tenantId, matterId],
    );
    for (const row of partyRows.rows as Array<{
      name: string;
      party_role: string;
      related_client_domain: string | null;
    }>) {
      const relatedClientDomain = normalizeDomainRef(row.related_client_domain);
      const domains = [
        ...extractDomainRefsFromText(row.name),
        ...(relatedClientDomain ? [relatedClientDomain] : []),
      ];
      if (row.party_role === 'client') {
        for (const domain of domains) clientDomains.add(domain);
      }
      if (row.party_role === 'counterparty' || row.party_role === 'opposing_counsel') {
        for (const domain of domains) opposingDomains.add(domain);
      }
    }
    return { tenantDomains, clientDomains, opposingDomains };
  }
}

export type EmailReparseJob = Job<EmailReparseJobPayload>;
