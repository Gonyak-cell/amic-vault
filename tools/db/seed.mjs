#!/usr/bin/env node
import fs from 'node:fs';
import argon2 from 'argon2';
import { Client } from 'pg';
import { databaseUrl } from './config.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('refusing to seed when NODE_ENV=production');
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/seed/users.json', 'utf8'));
const DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME = 'AMIC local file organization prep';

function devHash(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function seedMatterIntakeTemplates(client, tenantId) {
  await client.query(
    `
      WITH inserted_policy AS (
        INSERT INTO ai_policies (
          tenant_id,
          name,
          allowed_model_tiers,
          external_model_allowed,
          default_effect
        )
        SELECT
          $1,
          $2,
          ARRAY['local']::text[],
          false,
          'DENY'
        WHERE NOT EXISTS (
          SELECT 1
          FROM ai_policies
          WHERE tenant_id = $1
            AND name = $2
            AND allowed_model_tiers = ARRAY['local']::text[]
            AND external_model_allowed = false
            AND default_effect = 'DENY'
        )
        RETURNING tenant_id, policy_id, updated_at, created_at
      ),
      default_policy AS (
        SELECT policy_id
        FROM (
          SELECT policy_id, updated_at, created_at
          FROM inserted_policy
          UNION ALL
          SELECT policy_id, updated_at, created_at
          FROM ai_policies
          WHERE tenant_id = $1
            AND name = $2
            AND allowed_model_tiers = ARRAY['local']::text[]
            AND external_model_allowed = false
            AND default_effect = 'DENY'
        ) policies
        ORDER BY updated_at DESC, created_at DESC, policy_id
        LIMIT 1
      ),
      template_seed AS (
        SELECT
          'default_open'::text AS template_code,
          '기본개방 Matter'::text AS display_name,
          '펌 전체 열람과 로컬 파일 정리 준비 정책을 적용합니다.'::text AS description,
          'firm_open'::text AS default_access_scope
        UNION ALL
        SELECT
          'restricted'::text AS template_code,
          '제한 Matter'::text AS display_name,
          '명시된 Matter 구성원 중심으로 열람을 제한합니다.'::text AS description,
          'restricted'::text AS default_access_scope
      )
      INSERT INTO matter_intake_templates (
        tenant_id,
        template_code,
        display_name,
        description,
        default_access_scope,
        default_ai_policy_id,
        initial_member_policy_json
      )
      SELECT
        $1,
        template_seed.template_code,
        template_seed.display_name,
        template_seed.description,
        template_seed.default_access_scope,
        default_policy.policy_id,
        '{"leadLawyer":"owner"}'::jsonb
      FROM template_seed
      CROSS JOIN default_policy
      ON CONFLICT (tenant_id, template_code)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        default_access_scope = EXCLUDED.default_access_scope,
        default_ai_policy_id = EXCLUDED.default_ai_policy_id,
        initial_member_policy_json = EXCLUDED.initial_member_policy_json,
        status = 'active',
        updated_at = now()
    `,
    [tenantId, DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME],
  );
}

async function seedDdRfiTemplates(client, tenantId) {
  await client.query(
    `
      INSERT INTO dd_rfi_templates (
        tenant_id, template_code, transaction_type, name, items_json
      )
      VALUES
        (
          $1,
          'ma_basic',
          'ma_basic',
          'M&A basic due diligence',
          '[
            {"rfi_code":"MA.CORP.01","category":"corporate","title":"Corporate registry extract","description":"Current corporate registry and charter package.","priority":"high"},
            {"rfi_code":"MA.FIN.01","category":"finance","title":"Recent financial statements","description":"Audited or management financial statements for the review period.","priority":"high"},
            {"rfi_code":"MA.LIT.01","category":"litigation","title":"Material disputes schedule","description":"Pending or threatened claims, disputes, and regulatory proceedings.","priority":"medium"},
            {"rfi_code":"MA.EMP.01","category":"employment","title":"Key employee agreements","description":"Executive, founder, and key employee agreements.","priority":"medium"}
          ]'::jsonb
        ),
        (
          $1,
          'ma_lite',
          'ma_lite',
          'M&A lite due diligence',
          '[
            {"rfi_code":"LITE.CORP.01","category":"corporate","title":"Corporate profile","description":"Current corporate profile and ownership summary.","priority":"medium"},
            {"rfi_code":"LITE.FIN.01","category":"finance","title":"Management accounts","description":"Latest management accounts and debt summary.","priority":"medium"}
          ]'::jsonb
        )
      ON CONFLICT (tenant_id, template_code) DO NOTHING
    `,
    [tenantId],
  );
}

const client = new Client({ connectionString: databaseUrl() });
await client.connect();

try {
  const r11SharingPolicies = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.sharing_policy_definitions')
          AND conname = 'sharing_policy_definitions_status_check'
          AND pg_get_constraintdef(oid) LIKE '%enabled_r11%'
      ) AS present
    `,
  );
  const canSeedR11SharingPolicies = Boolean(r11SharingPolicies.rows[0]?.present);

  await client.query('BEGIN');
  for (const tenant of fixture.tenants) {
    await client.query(
      `
        INSERT INTO tenants (tenant_id, name, slug, region, data_residency, status)
        VALUES ($1, $2, $3, $4, $5, 'active')
        ON CONFLICT (tenant_id) DO UPDATE
          SET name = EXCLUDED.name,
              slug = EXCLUDED.slug,
              region = EXCLUDED.region,
              data_residency = EXCLUDED.data_residency,
              updated_at = now()
      `,
      [tenant.tenantId, tenant.name, tenant.slug, tenant.region, tenant.dataResidency],
    );

    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      tenant.tenantId,
    ]);

    await seedMatterIntakeTemplates(client, tenant.tenantId);
    await seedDdRfiTemplates(client, tenant.tenantId);

    if (canSeedR11SharingPolicies) {
      await client.query(
        `
          INSERT INTO sharing_policy_definitions (
            tenant_id, policy_key, status, enforcement_mode, control_ref
          )
          VALUES
            ($1, 'external_sharing', 'enabled_r11', 'controlled_allow', 'R11_EXTERNAL_SHARING_CRITICAL_GATE'),
            ($1, 'secure_link', 'enabled_r11', 'controlled_allow', 'R11_EXTERNAL_SHARING_CRITICAL_GATE'),
            ($1, 'external_user_access', 'enabled_r11', 'controlled_allow', 'R11_EXTERNAL_SHARING_CRITICAL_GATE')
          ON CONFLICT (tenant_id, policy_key) DO UPDATE
            SET status = EXCLUDED.status,
                enforcement_mode = EXCLUDED.enforcement_mode,
                control_ref = EXCLUDED.control_ref,
                updated_at = now()
        `,
        [tenant.tenantId],
      );
    }

    await client.query(
      `
        INSERT INTO workspaces (workspace_id, tenant_id, name, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (tenant_id, name) DO UPDATE
          SET workspace_id = EXCLUDED.workspace_id,
              status = EXCLUDED.status,
              updated_at = now()
      `,
      [tenant.workspace.workspaceId, tenant.tenantId, tenant.workspace.name],
    );

    for (const user of tenant.users) {
      await client.query(
        `
          INSERT INTO users (
            user_id, tenant_id, email, name, role, practice_group, status,
            password_hash, mfa_enabled
          )
          VALUES ($1, $2, lower($3), $4, $5, $6, 'active', $7, false)
          ON CONFLICT (user_id) DO UPDATE
            SET email = EXCLUDED.email,
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                practice_group = EXCLUDED.practice_group,
                status = EXCLUDED.status,
                password_hash = EXCLUDED.password_hash,
                updated_at = now()
        `,
        [
          user.userId,
          tenant.tenantId,
          user.email,
          user.name,
          user.role,
          user.practiceGroup,
          await devHash(user.devPassword),
        ],
      );
    }
  }
  await client.query('COMMIT');
  const userCount = fixture.tenants.reduce((count, tenant) => count + tenant.users.length, 0);
  console.log(`seed completed: tenants=${fixture.tenants.length} users=${userCount}`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
