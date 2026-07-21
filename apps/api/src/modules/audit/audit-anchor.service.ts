import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditService, type QueryClient } from './audit.service';
import { StorageService } from '../storage/storage.service';

const sha256HexPattern = /^[0-9a-f]{64}$/;
const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

interface AuditEventAnchorRow {
  seq: string;
  event_id: string;
  tenant_id: string;
  actor_type: string;
  actor_id: string | null;
  session_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  matter_id: string | null;
  result: string;
  metadata_json: unknown;
  ip_address: string | null;
  correlation_id: string | null;
  retention_label: string | null;
  created_at: Date | string;
}

export interface AuditAnchorRecord {
  anchorId: string;
  tenantId: string;
  anchorDate: string;
  seqStart: string | null;
  seqEnd: string | null;
  eventCount: number;
  eventsHash: string;
  previousAnchorHash: string | null;
  anchorHash: string;
  storageUri: string | null;
  recordedAuditEventId: string | null;
  createdAt: string;
}

interface AuditAnchorRow {
  anchor_id: string;
  tenant_id: string;
  anchor_date: Date | string;
  seq_start: string | null;
  seq_end: string | null;
  event_count: number | string;
  events_hash: string;
  previous_anchor_hash: string | null;
  anchor_hash: string;
  storage_uri: string | null;
  recorded_audit_event_id: string | null;
  created_at: Date | string;
}

interface AnchorPayload {
  version: 1;
  tenantId: string;
  anchorDate: string;
  seqStart: string | null;
  seqEnd: string | null;
  eventCount: number;
  eventsHash: string;
  previousAnchorHash: string | null;
}

export interface ComputedAuditAnchor {
  payload: AnchorPayload;
  eventCount: number;
  seqStart: string | null;
  seqEnd: string | null;
  eventsHash: string;
  anchorHash: string;
}

export interface AuditAnchorVerificationItem extends AuditAnchorRecord {
  verified: boolean;
  expectedEventsHash: string;
  expectedAnchorHash: string;
  reason: 'ok' | 'events_hash_mismatch' | 'anchor_hash_mismatch' | 'previous_hash_mismatch';
}

export interface AuditAnchorVerificationResult {
  ok: boolean;
  checkedCount: number;
  items: AuditAnchorVerificationItem[];
}

@Injectable()
export class AuditAnchorService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional()
    @Inject(StorageService)
    private readonly storageService?: Pick<StorageService, 'putAuditAnchorObject'>,
  ) {}

  async recordDailyAnchor(input: {
    tenantId: string;
    anchorDate: string;
  }): Promise<AuditAnchorRecord> {
    const anchorDate = normalizeAnchorDate(input.anchorDate);
    return this.auditService.transaction(input.tenantId, async (client) => {
      const existing = await this.findAnchor(client, input.tenantId, anchorDate);
      if (existing) return mapAnchorRow(existing);

      const previousAnchorHash = await this.findPreviousAnchorHash(
        client,
        input.tenantId,
        anchorDate,
      );
      const computed = await computeAuditAnchor(client, {
        tenantId: input.tenantId,
        anchorDate,
        previousAnchorHash,
      });
      const storageUri = await this.storeAnchorReceipt(input.tenantId, anchorDate, computed);
      const auditEvent = await this.auditService.log(
        {
          tenantId: input.tenantId,
          action: 'AUDIT_ANCHOR_RECORDED',
          targetType: 'audit_daily_anchor',
          result: 'success',
          metadata: {
            scope_type: 'audit_daily_anchor',
            scope_id: anchorDate,
            seq_start: computed.seqStart === null ? 0 : Number(computed.seqStart),
            seq_end: computed.seqEnd === null ? 0 : Number(computed.seqEnd),
            event_count: computed.eventCount,
            hash: computed.anchorHash,
          },
        },
        client,
      );
      const inserted = await client.query(
        `
          INSERT INTO audit_daily_anchors (
            tenant_id, anchor_date, seq_start, seq_end, event_count, events_hash,
            previous_anchor_hash, anchor_hash, storage_uri, recorded_audit_event_id
          )
          VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          input.tenantId,
          anchorDate,
          computed.seqStart,
          computed.seqEnd,
          computed.eventCount,
          computed.eventsHash,
          computed.payload.previousAnchorHash,
          computed.anchorHash,
          storageUri,
          auditEvent.eventId,
        ],
      );
      return mapAnchorRow(singleRow<AuditAnchorRow>(inserted.rows, 'audit anchor insert'));
    });
  }

  async listRecentAnchors(input: { tenantId: string; limit?: number }): Promise<AuditAnchorRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 7, 1), 31);
    return this.auditService.transaction(input.tenantId, async (client) => {
      const result = await client.query(
        `
          SELECT *
          FROM audit_daily_anchors
          WHERE tenant_id = $1
          ORDER BY anchor_date DESC
          LIMIT $2
        `,
        [input.tenantId, limit],
      );
      return (result.rows as AuditAnchorRow[]).map(mapAnchorRow);
    });
  }

  async verifyAnchors(input: {
    tenantId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AuditAnchorVerificationResult> {
    const fromDate = input.fromDate ? normalizeAnchorDate(input.fromDate) : null;
    const toDate = input.toDate ? normalizeAnchorDate(input.toDate) : null;
    return this.auditService.transaction(input.tenantId, (client) =>
      verifyAuditAnchors(client, { tenantId: input.tenantId, fromDate, toDate }),
    );
  }

  private async findAnchor(
    client: QueryClient,
    tenantId: string,
    anchorDate: string,
  ): Promise<AuditAnchorRow | null> {
    const result = await client.query(
      `
        SELECT *
        FROM audit_daily_anchors
        WHERE tenant_id = $1
          AND anchor_date = $2::date
        LIMIT 1
      `,
      [tenantId, anchorDate],
    );
    return (result.rows[0] as AuditAnchorRow | undefined) ?? null;
  }

  private async findPreviousAnchorHash(
    client: QueryClient,
    tenantId: string,
    anchorDate: string,
  ): Promise<string | null> {
    const result = await client.query(
      `
        SELECT anchor_hash
        FROM audit_daily_anchors
        WHERE tenant_id = $1
          AND anchor_date < $2::date
        ORDER BY anchor_date DESC
        LIMIT 1
      `,
      [tenantId, anchorDate],
    );
    const row = result.rows[0] as { anchor_hash?: string | null } | undefined;
    return row?.anchor_hash ?? null;
  }

  private async storeAnchorReceipt(
    tenantId: string,
    anchorDate: string,
    computed: ComputedAuditAnchor,
  ): Promise<string | null> {
    if (!this.storageService) return null;
    const receipt = Buffer.from(
      stableJsonStringify({
        ...computed.payload,
        anchorHash: computed.anchorHash,
        recordedAt: new Date().toISOString(),
      }),
      'utf8',
    );
    const result = await this.storageService.putAuditAnchorObject({
      tenantId,
      anchorDate,
      body: receipt,
      contentLength: receipt.byteLength,
      contentType: 'application/json',
    });
    return result.storageUri;
  }
}

export async function computeAuditAnchor(
  client: QueryClient,
  input: { tenantId: string; anchorDate: string; previousAnchorHash?: string | null },
): Promise<ComputedAuditAnchor> {
  const anchorDate = normalizeAnchorDate(input.anchorDate);
  const events = await loadAuditEventsForDate(client, input.tenantId, anchorDate);
  const serializedEvents = events.map(serializeAuditEventForAnchor).join('\n');
  const eventsHash = sha256Hex(serializedEvents);
  const seqStart = events[0]?.seq ?? null;
  const seqEnd = events[events.length - 1]?.seq ?? null;
  const payload: AnchorPayload = {
    version: 1,
    tenantId: input.tenantId,
    anchorDate,
    seqStart,
    seqEnd,
    eventCount: events.length,
    eventsHash,
    previousAnchorHash: normalizePreviousHash(input.previousAnchorHash ?? null),
  };
  return {
    payload,
    eventCount: events.length,
    seqStart,
    seqEnd,
    eventsHash,
    anchorHash: sha256Hex(stableJsonStringify(payload)),
  };
}

export async function verifyAuditAnchors(
  client: QueryClient,
  input: { tenantId: string; fromDate?: string | null; toDate?: string | null },
): Promise<AuditAnchorVerificationResult> {
  const rows = await loadAnchorRows(client, input);
  let previousHash = await findAnchorHashBefore(client, input.tenantId, rows[0]?.anchor_date ?? null);
  const items: AuditAnchorVerificationItem[] = [];
  for (const row of rows) {
    const record = mapAnchorRow(row);
    const computed = await computeAuditAnchor(client, {
      tenantId: input.tenantId,
      anchorDate: record.anchorDate,
      previousAnchorHash: previousHash,
    });
    const reason = verificationReason(record, computed, previousHash);
    items.push({
      ...record,
      verified: reason === 'ok',
      expectedEventsHash: computed.eventsHash,
      expectedAnchorHash: computed.anchorHash,
      reason,
    });
    previousHash = record.anchorHash;
  }
  return {
    ok: items.every((item) => item.verified),
    checkedCount: items.length,
    items,
  };
}

export function normalizeAnchorDate(value: string | Date): string {
  if (value instanceof Date) return localDateString(value);
  if (!utcDatePattern.test(value)) throw new Error('anchorDate must be YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('anchorDate must be a valid UTC date');
  }
  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function serializeAuditEventForAnchor(row: AuditEventAnchorRow): string {
  return stableJsonStringify({
    seq: row.seq,
    eventId: row.event_id,
    tenantId: row.tenant_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    sessionId: row.session_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    matterId: row.matter_id,
    result: row.result,
    metadata: sortJsonValue(row.metadata_json),
    ipAddress: row.ip_address,
    correlationId: row.correlation_id,
    retentionLabel: row.retention_label,
    createdAt: toIsoString(row.created_at),
  });
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sortJsonValue(entryValue)]));
  }
  return value;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function loadAuditEventsForDate(
  client: QueryClient,
  tenantId: string,
  anchorDate: string,
): Promise<AuditEventAnchorRow[]> {
  const result = await client.query(
    `
      SELECT
        seq::text AS seq,
        event_id::text AS event_id,
        tenant_id::text AS tenant_id,
        actor_type,
        actor_id::text AS actor_id,
        session_id::text AS session_id,
        action,
        target_type,
        target_id::text AS target_id,
        matter_id::text AS matter_id,
        result,
        metadata_json,
        ip_address::text AS ip_address,
        correlation_id,
        retention_label,
        created_at
      FROM audit_events
      WHERE tenant_id = $1
        AND created_at >= ($2::date::timestamp AT TIME ZONE 'UTC')
        AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')
        AND action <> 'AUDIT_ANCHOR_RECORDED'
      ORDER BY audit_events.seq ASC
    `,
    [tenantId, anchorDate],
  );
  return result.rows as AuditEventAnchorRow[];
}

async function loadAnchorRows(
  client: QueryClient,
  input: { tenantId: string; fromDate?: string | null; toDate?: string | null },
): Promise<AuditAnchorRow[]> {
  const filters = ['tenant_id = $1'];
  const params: unknown[] = [input.tenantId];
  if (input.fromDate) {
    params.push(normalizeAnchorDate(input.fromDate));
    filters.push(`anchor_date >= $${params.length}::date`);
  }
  if (input.toDate) {
    params.push(normalizeAnchorDate(input.toDate));
    filters.push(`anchor_date <= $${params.length}::date`);
  }
  const result = await client.query(
    `
      SELECT *
      FROM audit_daily_anchors
      WHERE ${filters.join(' AND ')}
      ORDER BY anchor_date ASC
    `,
    params,
  );
  return result.rows as AuditAnchorRow[];
}

async function findAnchorHashBefore(
  client: QueryClient,
  tenantId: string,
  rawAnchorDate: Date | string | null,
): Promise<string | null> {
  if (rawAnchorDate === null) return null;
  const anchorDate = normalizeAnchorDate(rawAnchorDate instanceof Date ? rawAnchorDate : String(rawAnchorDate));
  const result = await client.query(
    `
      SELECT anchor_hash
      FROM audit_daily_anchors
      WHERE tenant_id = $1
        AND anchor_date < $2::date
      ORDER BY anchor_date DESC
      LIMIT 1
    `,
    [tenantId, anchorDate],
  );
  const row = result.rows[0] as { anchor_hash?: string | null } | undefined;
  return row?.anchor_hash ?? null;
}

function verificationReason(
  record: AuditAnchorRecord,
  computed: ComputedAuditAnchor,
  expectedPreviousHash: string | null,
): AuditAnchorVerificationItem['reason'] {
  if (record.previousAnchorHash !== expectedPreviousHash) return 'previous_hash_mismatch';
  if (record.eventsHash !== computed.eventsHash) return 'events_hash_mismatch';
  if (record.anchorHash !== computed.anchorHash) return 'anchor_hash_mismatch';
  return 'ok';
}

function normalizePreviousHash(value: string | null): string | null {
  if (value === null) return null;
  if (!sha256HexPattern.test(value)) throw new Error('previous anchor hash must be sha256 hex');
  return value;
}

function mapAnchorRow(row: AuditAnchorRow): AuditAnchorRecord {
  return {
    anchorId: row.anchor_id,
    tenantId: row.tenant_id,
    anchorDate: normalizeAnchorDate(row.anchor_date instanceof Date ? row.anchor_date : String(row.anchor_date)),
    seqStart: row.seq_start,
    seqEnd: row.seq_end,
    eventCount: Number(row.event_count),
    eventsHash: row.events_hash,
    previousAnchorHash: row.previous_anchor_hash,
    anchorHash: row.anchor_hash,
    storageUri: row.storage_uri,
    recordedAuditEventId: row.recorded_audit_event_id,
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function localDateString(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function singleRow<T>(rows: readonly unknown[], operation: string): T {
  const row = rows[0] as T | undefined;
  if (!row) throw new Error(`${operation} returned no row`);
  return row;
}
