import { randomUUID } from 'node:crypto';
import {
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

export const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
export const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
export const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';
export const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
export const alphaPermissionMemberUserId = '11111111-1111-4111-8111-111111111105';
export const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

export interface SearchIndexedFixtureRow {
  tenantId: string;
  ownerUserId: string;
  clientId: string;
  matterId: string;
  documentId: string;
  versionId: string;
  title: string;
  contentText: string;
  documentType: 'contract' | 'memo' | 'evidence';
  documentStatus: 'draft' | 'deleted';
  versionStatus: 'current' | 'superseded';
  updatedAt: string;
}

export interface SearchFixture {
  alphaClientId: string;
  alphaMatterId: string;
  alphaDocumentIds: string[];
  alphaVersionIds: string[];
  betaVersionIds: string[];
}

export interface AddMatterMemberInput {
  tenantId: string;
  matterId: string;
  userId: string;
  matterRole?: 'owner' | 'member' | 'limited_reviewer';
  accessLevel?: 'read' | 'edit';
  addedBy?: string;
}

export interface AddExplicitPermissionInput {
  tenantId: string;
  resourceType: 'matter' | 'document';
  resourceId: string;
  subjectType?: 'user' | 'group' | 'role';
  subjectId: string;
  effect: 'ALLOW' | 'DENY';
  action?: 'read';
  conditionJson?: Record<string, unknown> | null;
  createdBy?: string;
}

function hexHash(index: number): string {
  return index.toString(16).padStart(64, '0').slice(-64);
}

function makeStorageUri(input: {
  tenantId: string;
  matterId: string;
  documentId: string;
  fileObjectId: string;
}): string {
  return `s3://amic-vault-dev/tenants/${input.tenantId}/matters/${input.matterId}/documents/${input.documentId}/${input.fileObjectId}`;
}

export function tenantVersionScope(tenantId: string, versionIds: readonly string[]) {
  return {
    sql: 'idx.tenant_id = ? AND idx.version_id = ANY(?::uuid[])',
    params: [tenantId, versionIds],
  };
}

export async function addMatterMember(input: AddMatterMemberInput): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (matter_id, user_id)
        DO UPDATE SET matter_role = EXCLUDED.matter_role,
          access_level = EXCLUDED.access_level
      `,
      [
        input.tenantId,
        input.matterId,
        input.userId,
        input.matterRole ?? 'member',
        input.accessLevel ?? 'read',
        input.addedBy ?? alphaOwnerUserId,
      ],
    );
  });
}

export async function removeMatterMember(input: {
  tenantId: string;
  matterId: string;
  userId: string;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        DELETE FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
      `,
      [input.tenantId, input.matterId, input.userId],
    );
  });
}

export async function addExplicitPermission(input: AddExplicitPermissionInput): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, condition_json, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        input.tenantId,
        input.subjectType ?? 'user',
        input.subjectId,
        input.resourceType,
        input.resourceId,
        input.action ?? 'read',
        input.effect,
        input.conditionJson === undefined ? null : JSON.stringify(input.conditionJson),
        input.createdBy ?? alphaOwnerUserId,
      ],
    );
  });
}

export async function setDocumentSecurity(input: {
  tenantId: string;
  documentId: string;
  confidentialityLevel: 'standard' | 'high' | 'restricted';
  privilegeStatus?: 'none' | 'privileged' | 'work_product' | 'joint_privilege';
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        UPDATE documents
        SET confidentiality_level = $3,
          privilege_status = $4,
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
      `,
      [
        input.tenantId,
        input.documentId,
        input.confidentialityLevel,
        input.privilegeStatus ?? 'none',
      ],
    );
  });
}

export async function createGroupWithMember(input: {
  tenantId: string;
  userId: string;
  addedBy?: string;
  name?: string;
}): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    const groupId = randomUUID();
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO groups (group_id, tenant_id, name, group_type, created_by)
        VALUES ($1, $2, $3, 'custom', $4)
      `,
      [
        groupId,
        input.tenantId,
        input.name ?? `Search Group ${groupId}`,
        input.addedBy ?? alphaOwnerUserId,
      ],
    );
    await client.query(
      `
        INSERT INTO group_members (group_id, tenant_id, user_id, added_by)
        VALUES ($1, $2, $3, $4)
      `,
      [groupId, input.tenantId, input.userId, input.addedBy ?? alphaOwnerUserId],
    );
    return groupId;
  });
}

export async function createEthicalWall(input: {
  tenantId: string;
  matterId: string;
  createdBy?: string;
  name?: string;
}): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    const wallId = randomUUID();
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO ethical_walls (
          wall_id, tenant_id, matter_id, wall_name, reason, created_by
        )
        VALUES ($1, $2, $3, $4, 'search permission fixture', $5)
      `,
      [
        wallId,
        input.tenantId,
        input.matterId,
        input.name ?? `Search Wall ${wallId}`,
        input.createdBy ?? alphaOwnerUserId,
      ],
    );
    return wallId;
  });
}

export async function addWallMembership(input: {
  tenantId: string;
  wallId: string;
  subjectType?: 'user' | 'group';
  subjectId: string;
  membershipType: 'insider' | 'excluded';
  createdBy?: string;
}): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await setTenant(client, input.tenantId);
    await client.query(
      `
        INSERT INTO ethical_wall_memberships (
          tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.tenantId,
        input.wallId,
        input.subjectType ?? 'user',
        input.subjectId,
        input.membershipType,
        input.createdBy ?? alphaOwnerUserId,
      ],
    );
  });
}

export async function insertSearchIndexedRow(
  row: SearchIndexedFixtureRow,
  index: number,
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    const fileObjectId = randomUUID();
    await client.query('BEGIN');
    try {
      await setTenant(client, row.tenantId);
      await client.query(
        `
          INSERT INTO clients (client_id, tenant_id, name, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (client_id) DO NOTHING
        `,
        [row.clientId, row.tenantId, `${row.title} Client`, row.ownerUserId],
      );
      await client.query(
        `
          INSERT INTO matters (
            matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
            status, lead_lawyer_id, created_by
          )
          VALUES ($1, $2, $3, $4, $5, 'contract', 'active', $6, $6)
          ON CONFLICT (tenant_id, matter_id) DO NOTHING
        `,
        [
          row.matterId,
          row.tenantId,
          row.clientId,
          `SC-${index}-${randomUUID()}`,
          `${row.title} Matter`,
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO file_objects (
            file_object_id, tenant_id, storage_uri, original_filename, normalized_filename,
            mime_type, size_bytes, sha256, created_by
          )
          VALUES ($1, $2, $3, $4, $4, 'application/pdf', 32, $5, $6)
        `,
        [
          fileObjectId,
          row.tenantId,
          makeStorageUri({
            tenantId: row.tenantId,
            matterId: row.matterId,
            documentId: row.documentId,
            fileObjectId,
          }),
          `${row.title}.pdf`,
          hexHash(index),
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO documents (
            document_id, tenant_id, matter_id, document_family_id, title, status,
            document_type, created_by, created_at, updated_at,
            deleted_at, deleted_by, deleted_previous_status
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
            CASE WHEN $6::text = 'deleted' THEN $9::timestamptz ELSE NULL END,
            CASE WHEN $6::text = 'deleted' THEN $8::uuid ELSE NULL END,
            CASE WHEN $6::text = 'deleted' THEN 'draft'::text ELSE NULL END
          )
        `,
        [
          row.documentId,
          row.tenantId,
          row.matterId,
          randomUUID(),
          row.title,
          row.documentStatus,
          row.documentType,
          row.ownerUserId,
          row.updatedAt,
        ],
      );
      await client.query(
        `
          INSERT INTO document_versions (
            version_id, tenant_id, document_id, version_no, version_status,
            file_object_id, file_hash, created_by
          )
          VALUES ($1, $2, $3, 1, $4, $5, $6, $7)
        `,
        [
          row.versionId,
          row.tenantId,
          row.documentId,
          row.versionStatus,
          fileObjectId,
          hexHash(index),
          row.ownerUserId,
        ],
      );
      await client.query(
        `
          INSERT INTO document_search_index (
            tenant_id, document_id, version_id, matter_id, client_id, document_type,
            document_status, version_status, title, content_text, source_text_hash,
            indexed_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
        `,
        [
          row.tenantId,
          row.documentId,
          row.versionId,
          row.matterId,
          row.clientId,
          row.documentType,
          row.documentStatus,
          row.versionStatus,
          row.title,
          row.contentText,
          hexHash(index + 100),
          row.updatedAt,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function createSearchFixture(marker: string): Promise<SearchFixture> {
  const alphaClientId = randomUUID();
  const alphaMatterId = randomUUID();
  const betaClientId = randomUUID();
  const betaMatterId = randomUUID();
  const rows: SearchIndexedFixtureRow[] = [
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: alphaClientId,
      matterId: alphaMatterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `${marker} Termination Agreement`,
      contentText: 'governing law indemnity <script>alert(1)</script> termination covenant',
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: alphaClientId,
      matterId: alphaMatterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `${marker} Background Memo`,
      contentText: 'termination appears only in background memo text',
      documentType: 'memo',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-11T00:00:00.000Z',
    },
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: alphaClientId,
      matterId: alphaMatterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `${marker} Superseded Contract`,
      contentText: 'termination superseded content',
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'superseded',
      updatedAt: '2026-06-12T00:00:00.000Z',
    },
    {
      tenantId: tenantAlphaId,
      ownerUserId: alphaOwnerUserId,
      clientId: alphaClientId,
      matterId: alphaMatterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `${marker} Deleted Evidence`,
      contentText: 'termination deleted content',
      documentType: 'evidence',
      documentStatus: 'deleted',
      versionStatus: 'current',
      updatedAt: '2026-06-13T00:00:00.000Z',
    },
    {
      tenantId: tenantBetaId,
      ownerUserId: betaOwnerUserId,
      clientId: betaClientId,
      matterId: betaMatterId,
      documentId: randomUUID(),
      versionId: randomUUID(),
      title: `${marker} Beta Contract`,
      contentText: 'termination beta content',
      documentType: 'contract',
      documentStatus: 'draft',
      versionStatus: 'current',
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
  ];

  for (const [index, row] of rows.entries()) {
    await insertSearchIndexedRow(row, index + 1);
  }

  return {
    alphaClientId,
    alphaMatterId,
    alphaDocumentIds: rows
      .filter((row) => row.tenantId === tenantAlphaId)
      .map((row) => row.documentId),
    alphaVersionIds: rows.filter((row) => row.tenantId === tenantAlphaId).map((row) => row.versionId),
    betaVersionIds: rows.filter((row) => row.tenantId === tenantBetaId).map((row) => row.versionId),
  };
}
