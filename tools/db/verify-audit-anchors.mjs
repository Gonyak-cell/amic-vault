import { createHash } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';

const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeDate(value, name) {
  if (value === undefined) return null;
  if (!utcDatePattern.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid UTC date`);
  }
  return value;
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }
  return value;
}

function stableJsonStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeAnchorDate(value) {
  if (value instanceof Date) {
    const year = String(value.getFullYear()).padStart(4, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function serializeAuditEvent(row) {
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

async function loadEvents(client, tenantId, anchorDate) {
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
  return result.rows;
}

async function computeAnchor(client, tenantId, anchorDate, previousAnchorHash) {
  const events = await loadEvents(client, tenantId, anchorDate);
  const eventsHash = sha256Hex(events.map(serializeAuditEvent).join('\n'));
  const payload = {
    version: 1,
    tenantId,
    anchorDate,
    seqStart: events[0]?.seq ?? null,
    seqEnd: events[events.length - 1]?.seq ?? null,
    eventCount: events.length,
    eventsHash,
    previousAnchorHash,
  };
  return {
    eventsHash,
    anchorHash: sha256Hex(stableJsonStringify(payload)),
  };
}

async function loadAnchors(client, tenantId, fromDate, toDate) {
  const filters = ['tenant_id = $1'];
  const params = [tenantId];
  if (fromDate) {
    params.push(fromDate);
    filters.push(`anchor_date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
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
  return result.rows;
}

async function previousHash(client, tenantId, anchorDate) {
  if (!anchorDate) return null;
  const result = await client.query(
    `
      SELECT anchor_hash
      FROM audit_daily_anchors
      WHERE tenant_id = $1
        AND anchor_date < $2::date
      ORDER BY anchor_date DESC
      LIMIT 1
    `,
    [tenantId, normalizeAnchorDate(anchorDate)],
  );
  return result.rows[0]?.anchor_hash ?? null;
}

function usage() {
  return [
    'Usage: node tools/db/verify-audit-anchors.mjs --tenant-id <uuid> [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
    'Uses DATABASE_URL unless --database-url is supplied.',
  ].join('\n');
}

async function main() {
  const tenantId = argValue('--tenant-id');
  if (!tenantId) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  const fromDate = normalizeDate(argValue('--from'), '--from');
  const toDate = normalizeDate(argValue('--to'), '--to');
  const databaseUrl = argValue('--database-url') ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const anchors = await loadAnchors(client, tenantId, fromDate, toDate);
    let priorHash = await previousHash(client, tenantId, anchors[0]?.anchor_date ?? null);
    const mismatches = [];
    for (const anchor of anchors) {
      const anchorDate = normalizeAnchorDate(anchor.anchor_date);
      const computed = await computeAnchor(client, tenantId, anchorDate, priorHash);
      if (anchor.previous_anchor_hash !== priorHash) {
        mismatches.push({ anchorDate, reason: 'previous_hash_mismatch' });
      } else if (anchor.events_hash !== computed.eventsHash) {
        mismatches.push({ anchorDate, reason: 'events_hash_mismatch' });
      } else if (anchor.anchor_hash !== computed.anchorHash) {
        mismatches.push({ anchorDate, reason: 'anchor_hash_mismatch' });
      }
      priorHash = anchor.anchor_hash;
    }
    await client.query('COMMIT');
    if (mismatches.length > 0) {
      console.error(JSON.stringify({ ok: false, checkedCount: anchors.length, mismatches }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`all anchors verified (${anchors.length})`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
