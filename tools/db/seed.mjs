#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Client } from 'pg';
import { databaseUrl } from './config.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('refusing to seed when NODE_ENV=production');
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/seed/users.json', 'utf8'));

function devHash(password) {
  return `dev-sha256:${crypto.createHash('sha256').update(password).digest('hex')}`;
}

const client = new Client({ connectionString: databaseUrl() });
await client.connect();

try {
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
          devHash(user.devPassword),
        ],
      );
    }
  }
  await client.query('COMMIT');
  console.log('seed completed: tenants=2 users=4');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
