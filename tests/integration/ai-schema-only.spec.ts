import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';
import { readIfSmall, sourceFiles } from './document-access/document-api-helpers';

describe('ai-schema-only integration', () => {
  it('creates default-deny schema with tenant RLS and no R2 evaluation surface', async () => {
    await withClient(createOwnerClient(), async (client) => {
      const columns = await client.query<{
        table_name: string;
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `
          SELECT table_name, column_name, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'documents' AND column_name = 'ai_allowed')
              OR (table_name = 'matters' AND column_name = 'ai_policy_id')
            )
          ORDER BY table_name, column_name
        `,
      );
      expect(columns.rows).toEqual([
        {
          table_name: 'documents',
          column_name: 'ai_allowed',
          is_nullable: 'NO',
          column_default: 'false',
        },
        {
          table_name: 'matters',
          column_name: 'ai_policy_id',
          is_nullable: 'YES',
          column_default: null,
        },
      ]);

      const checks = await client.query<{ conname: string; definition: string }>(
        `
          SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conrelid = 'ai_policies'::regclass
          ORDER BY conname
        `,
      );
      expect(checks.rows.map((row) => `${row.conname}:${row.definition}`).join('\n')).toContain(
        'default_effect',
      );
      expect(checks.rows.map((row) => `${row.conname}:${row.definition}`).join('\n')).toContain(
        'external_model_allowed',
      );

      const policyId = randomUUID();
      await client.query(
        `
          INSERT INTO ai_policies (policy_id, tenant_id, name)
          VALUES ($1, $2, 'Schema Only')
        `,
        [policyId, tenantAlphaId],
      );

      await withClient(createAppClient(), async (appClient) => {
        await setTenant(appClient, tenantAlphaId);
        const alpha = await appClient.query<{ count: string }>(
          'SELECT count(*)::text FROM ai_policies WHERE policy_id = $1',
          [policyId],
        );
        expect(alpha.rows[0]?.count).toBe('1');
        await setTenant(appClient, tenantBetaId);
        const beta = await appClient.query<{ count: string }>(
          'SELECT count(*)::text FROM ai_policies WHERE policy_id = $1',
          [policyId],
        );
        expect(beta.rows[0]?.count).toBe('0');
      });
    });

    const forbiddenRefs = ['apps', 'workers', 'packages']
      .flatMap(sourceFiles)
      .filter((file) => !file.endsWith(path.join('packages', 'shared', 'src', 'types', 'ai-policy.ts')))
      .flatMap((file) => {
        const text = readIfSmall(file);
        return /\b(ai_allowed|ai_policy_id|ai_policies|ai_policy)\b/.test(text) ? [file] : [];
      });
    expect(forbiddenRefs).toEqual([]);

    const controllerRefs = sourceFiles('apps/api/src').flatMap((file) => {
      if (!file.endsWith('.controller.ts')) return [];
      const text = readIfSmall(file);
      return /@(Controller|Get|Post|Patch|Delete)\(['"`][^'"`]*ai/i.test(text) ? [file] : [];
    });
    expect(controllerRefs).toEqual([]);

    const aiPackageDiff = execFileSync('git', ['diff', '--name-only', '--', 'packages/ai'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(aiPackageDiff).toEqual([]);
  });
});
