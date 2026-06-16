#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { loadEvaluationCases } from './load-evaluation-cases.ts';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const defaultTenantId = '11111111-1111-4111-8111-111111111111';
const alphaAdminUserId = '11111111-1111-4111-8111-111111111100';
const artifactKind = 'document_profile';

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fixtureUuid(serial: number): string {
  return `11111111-1111-4111-8111-${serial.toString(16).padStart(12, '0')}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildPayload(input: { index: number; chunkId: string }): Record<string, unknown> {
  const sourceRef = `chunk:${input.chunkId}`;
  const label = String(input.index).padStart(4, '0');
  return {
    answer: `합성 업로드 문서 ${label}의 파일 프로필입니다. 문서 유형과 보관 목적만 중립적으로 정리했습니다.`,
    sections: [
      {
        section_id: `profile-${label}`,
        heading: '파일 프로필',
        text: `합성 업로드 문서 ${label}는 로컬 AI prep 평가용 비식별 파일 조직 자료입니다.`,
        source_refs: [sourceRef],
      },
    ],
    claims: [
      {
        claim_id: `claim-${label}`,
        kind: 'summary',
        text: `합성 업로드 문서 ${label}는 파일 분류와 검색 보조를 위한 비식별 평가 fixture입니다.`,
        source_refs: [sourceRef],
        is_legal_conclusion: false,
      },
    ],
    warnings: [],
    source_refs: [sourceRef],
  };
}

async function seedLocalAiPrepArtifacts(input: {
  client: Client;
  tenantId: string;
  count: number;
}): Promise<number> {
  const clientId = fixtureUuid(0xa1000);
  const matterId = fixtureUuid(0xa1001);
  const policyId = fixtureUuid(0xa1002);

  await input.client.query('BEGIN');
  try {
    await input.client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      input.tenantId,
    ]);
    await input.client.query(
      `
        INSERT INTO clients (client_id, tenant_id, name, client_type, status, created_by)
        VALUES ($1, $2, 'LAI Local AI Eval Client', 'corporation', 'active', $3)
        ON CONFLICT (tenant_id, client_id)
        DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()
      `,
      [clientId, input.tenantId, alphaAdminUserId],
    );
    await input.client.query(
      `
        INSERT INTO ai_policies (
          policy_id, tenant_id, name, allowed_model_tiers, external_model_allowed, default_effect
        )
        VALUES ($1, $2, 'LAI local prep eval policy', ARRAY['local']::text[], false, 'DENY')
        ON CONFLICT (tenant_id, policy_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          allowed_model_tiers = EXCLUDED.allowed_model_tiers,
          external_model_allowed = false,
          default_effect = 'DENY',
          updated_at = now()
      `,
      [policyId, input.tenantId],
    );
    await input.client.query(
      `
        INSERT INTO ai_model_access_policies (
          tenant_id, route_key, model_tier, status, external_model_allowed
        )
        VALUES ($1, 'local_gemma', 'local', 'enabled', false)
        ON CONFLICT (tenant_id, route_key)
        DO UPDATE SET
          model_tier = 'local',
          status = 'enabled',
          external_model_allowed = false,
          updated_at = now()
      `,
      [input.tenantId],
    );
    await input.client.query(
      `
        INSERT INTO matters (
          matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, opened_at, lead_lawyer_id, practice_group, created_by, ai_policy_id
        )
        VALUES (
          $1, $2, $3, 'LAI-EVAL-LOCAL-AI', 'LAI Local AI Prep Eval Matter',
          'other', 'active', now(), $4, 'local-ai', $4, $5
        )
        ON CONFLICT (tenant_id, matter_id)
        DO UPDATE SET
          matter_name = EXCLUDED.matter_name,
          status = EXCLUDED.status,
          lead_lawyer_id = EXCLUDED.lead_lawyer_id,
          practice_group = EXCLUDED.practice_group,
          ai_policy_id = EXCLUDED.ai_policy_id,
          updated_at = now()
      `,
      [matterId, input.tenantId, clientId, alphaAdminUserId, policyId],
    );
    await input.client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, 'owner', 'edit', $3)
        ON CONFLICT (matter_id, user_id)
        DO UPDATE SET matter_role = 'owner', access_level = 'edit'
      `,
      [input.tenantId, matterId, alphaAdminUserId],
    );

    for (let index = 1; index <= input.count; index += 1) {
      const fileObjectId = fixtureUuid(0xa2000 + index);
      const documentId = fixtureUuid(0xa3000 + index);
      const versionId = fixtureUuid(0xa4000 + index);
      const parentChunkId = fixtureUuid(0xa5000 + index);
      const chunkId = fixtureUuid(0xa6000 + index);
      const artifactId = fixtureUuid(0xa7000 + index);
      const label = String(index).padStart(4, '0');
      const sourceHash = sha256Hex(`lai-local-ai-prep-source-${label}`);
      const textHash = sha256Hex(`lai-local-ai-prep-redacted-${label}`);
      const payload = buildPayload({ index, chunkId });
      const responseHash = sha256Hex(JSON.stringify(payload));
      const promptHash = sha256Hex(`lai-local-ai-prep-prompt-${label}`);

      await input.client.query(
        `
          INSERT INTO file_objects (
            file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
            mime_type, size_bytes, source_system, created_by, sha256
          )
          VALUES (
            $1, $2, $3, $4, $4, 'application/pdf', 256, 'upload', $5, $6
          )
          ON CONFLICT (tenant_id, file_object_id) DO NOTHING
        `,
        [
          fileObjectId,
          input.tenantId,
          `s3://amic-vault-dev/tenants/${input.tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
          `lai-local-ai-prep-${label}.pdf`,
          alphaAdminUserId,
          sourceHash,
        ],
      );
      await input.client.query(
        `
          INSERT INTO documents (
            document_id, tenant_id, matter_id, document_family_id, title, status,
            created_by, document_type, confidentiality_level, privilege_status, ai_allowed
          )
          VALUES (
            $1, $2, $3, $1, $4, 'draft', $5, 'other', 'standard', 'none', true
          )
          ON CONFLICT (tenant_id, document_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            document_type = EXCLUDED.document_type,
            confidentiality_level = EXCLUDED.confidentiality_level,
            ai_allowed = true,
            updated_at = now()
        `,
        [
          documentId,
          input.tenantId,
          matterId,
          `LAI local AI prep ${label}`,
          alphaAdminUserId,
        ],
      );
      await input.client.query(
        `
          INSERT INTO document_versions (
            version_id, tenant_id, document_id, version_no, version_status,
            file_object_id, file_hash, created_by
          )
          VALUES ($1, $2, $3, 1, 'current', $4, $5, $6)
          ON CONFLICT (tenant_id, version_id) DO NOTHING
        `,
        [versionId, input.tenantId, documentId, fileObjectId, sourceHash, alphaAdminUserId],
      );
      await input.client.query(
        `
          INSERT INTO document_chunks (
            chunk_id, tenant_id, document_id, version_id, parent_chunk_id,
            chunk_kind, chunk_ordinal, char_start, char_end, token_count,
            chunk_text, text_hash, source_text_hash, stale
          )
          VALUES
            ($1, $3, $4, $5, null, 'parent', 0, 0, 80, 16, $6, $7, $8, false),
            ($2, $3, $4, $5, $1, 'child', 1, 0, 80, 16, $6, $7, $8, false)
          ON CONFLICT (tenant_id, chunk_id)
          DO UPDATE SET stale = false, updated_at = now()
        `,
        [
          parentChunkId,
          chunkId,
          input.tenantId,
          documentId,
          versionId,
          `synthetic local ai prep source ${label}`,
          textHash,
          sourceHash,
        ],
      );
      await input.client.query(
        `
          INSERT INTO document_search_index (
            tenant_id, document_id, version_id, matter_id, client_id,
            document_type, document_status, version_status, title, content_text,
            source_text_hash
          )
          VALUES ($1, $2, $3, $4, $5, 'other', 'draft', 'current', $6, '', $7)
          ON CONFLICT (tenant_id, version_id)
          DO UPDATE SET
            matter_id = EXCLUDED.matter_id,
            client_id = EXCLUDED.client_id,
            document_type = EXCLUDED.document_type,
            document_status = EXCLUDED.document_status,
            version_status = EXCLUDED.version_status,
            title = EXCLUDED.title,
            content_text = '',
            source_text_hash = EXCLUDED.source_text_hash,
            updated_at = now()
        `,
        [
          input.tenantId,
          documentId,
          versionId,
          matterId,
          clientId,
          `LAI local AI prep ${label}`,
          sourceHash,
        ],
      );
      await input.client.query(
        `
          INSERT INTO ai_prep_artifacts (
            ai_prep_artifact_id, tenant_id, matter_id, document_id, document_version_id,
            artifact_kind, status, model_route, model_name, source_chunk_ids,
            source_hashes, prompt_hash, response_hash, payload_json, latency_ms,
            is_stale, stale_reason, failure_reason_code, generated_at, updated_at, stale_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'completed', 'local_gemma', 'gemma4:12b-eval-fixture',
            ARRAY[$7]::uuid[], $8::jsonb, $9, $10, $11::jsonb, 25,
            false, null, null, now(), now(), null
          )
          ON CONFLICT (tenant_id, document_version_id, artifact_kind)
          DO UPDATE SET
            status = 'completed',
            model_name = EXCLUDED.model_name,
            source_chunk_ids = EXCLUDED.source_chunk_ids,
            source_hashes = EXCLUDED.source_hashes,
            prompt_hash = EXCLUDED.prompt_hash,
            response_hash = EXCLUDED.response_hash,
            payload_json = EXCLUDED.payload_json,
            latency_ms = EXCLUDED.latency_ms,
            is_stale = false,
            stale_reason = null,
            failure_reason_code = null,
            generated_at = now(),
            updated_at = now(),
            stale_at = null
          RETURNING ai_prep_artifact_id
        `,
        [
          artifactId,
          input.tenantId,
          matterId,
          documentId,
          versionId,
          artifactKind,
          chunkId,
          JSON.stringify([sourceHash]),
          promptHash,
          responseHash,
          JSON.stringify(payload),
        ],
      );
      const existingAudit = await input.client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM audit_events
            WHERE tenant_id = $1
              AND action = 'AI_PREP_COMPLETED'
              AND target_type = 'ai_prep_artifact'
              AND target_id = $2
          ) AS exists
        `,
        [input.tenantId, artifactId],
      );
      if (!existingAudit.rows[0]?.exists) {
        await input.client.query(
          `
            INSERT INTO audit_events (
              tenant_id, actor_type, actor_id, action, target_type, target_id,
              matter_id, result, metadata_json
            )
            VALUES (
              $1, 'system', null, 'AI_PREP_COMPLETED', 'ai_prep_artifact', $2,
              $3, 'success', $4::jsonb
            )
          `,
          [
            input.tenantId,
            artifactId,
            matterId,
            JSON.stringify({
              ai_prep_artifact_id: artifactId,
              ai_prep_kind: artifactKind,
              ai_prep_status: 'completed',
              document_id: documentId,
              version_id: versionId,
              matter_id: matterId,
              model_route: 'local_gemma',
              model_name: 'gemma4:12b-eval-fixture',
              generation_result: 'gemma',
              source_chunk_count: 1,
              prompt_hash: promptHash,
              response_hash: responseHash,
            }),
          ],
        );
      }
    }

    await input.client.query('COMMIT');
    return input.count;
  } catch (error) {
    await input.client.query('ROLLBACK');
    throw error;
  }
}

const tenantId = readArg('--tenant-id') ?? defaultTenantId;
const count = Math.max(20, Number(readArg('--count') ?? '20'));
const databaseUrl = readArg('--database-url') ?? defaultDatabaseUrl;

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const cases = await loadEvaluationCases({
    client,
    tenantId,
    directory: readArg('--dir') ?? 'tests/fixtures/evalset-v0',
  });
  const seeded = await seedLocalAiPrepArtifacts({ client, tenantId, count });
  console.log(`local AI prep eval seed completed: eval_cases=${cases.loaded} artifacts=${seeded}`);
  for (const warning of cases.warnings) console.warn(warning);
} finally {
  await client.end();
}
