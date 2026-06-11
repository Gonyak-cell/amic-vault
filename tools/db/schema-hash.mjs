#!/usr/bin/env node
import crypto from 'node:crypto';
import { Client } from 'pg';
import { databaseUrl } from './config.mjs';

const client = new Client({ connectionString: databaseUrl() });
await client.connect();

const queries = [
  `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name <> 'schema_migrations'
    ORDER BY table_name, ordinal_position
  `,
  `
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
    ORDER BY tablename, indexname
  `,
  `
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid::regclass::text <> 'schema_migrations'
    ORDER BY table_name, conname
  `,
  `
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `,
  `
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name, event_manipulation
  `,
];

try {
  const payload = [];
  for (const query of queries) {
    const result = await client.query(query);
    payload.push(result.rows);
  }
  process.stdout.write(
    `${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}\n`,
  );
} finally {
  await client.end();
}
