#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.length > 2 ? process.argv.slice(2) : ['db/migrations'];
const exemptTables = new Set(['tenants']);
let failed = false;

function fail(file, message) {
  console.error(`${file}: ${message}`);
  failed = true;
}

function sqlFiles(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return root.endsWith('.sql') ? [root] : [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) return sqlFiles(full);
      return entry.isFile() && entry.name.endsWith('.sql') ? [full] : [];
    })
    .sort();
}

function createdTables(sql) {
  return [...sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+("?[\w]+"?)/gi)].map(
    (match) => match[1].replaceAll('"', ''),
  );
}

for (const root of roots) {
  for (const file of sqlFiles(root)) {
    const sql = fs.readFileSync(file, 'utf8');
    for (const table of createdTables(sql)) {
      const tablePattern = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (exemptTables.has(table)) {
        if (!/RLS-EXEMPT:/i.test(sql)) {
          fail(file, `${table}: RLS exemption requires RLS-EXEMPT comment`);
        }
        continue;
      }

      const createStart = sql.search(
        new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"?${tablePattern}"?`, 'i'),
      );
      const rest = sql.slice(createStart + 1);
      const nextCreate = rest.search(/CREATE\s+TABLE/i);
      const createBlock = nextCreate === -1 ? sql.slice(createStart) : sql.slice(createStart, createStart + 1 + nextCreate);

      if (!/\btenant_id\s+uuid\s+NOT\s+NULL\b/i.test(createBlock)) {
        fail(file, `${table}: missing tenant_id uuid NOT NULL`);
      }
      if (
        !new RegExp(
          `ALTER\\s+TABLE\\s+"?${tablePattern}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(sql)
      ) {
        fail(file, `${table}: missing ENABLE ROW LEVEL SECURITY`);
      }
      if (
        !new RegExp(
          `ALTER\\s+TABLE\\s+"?${tablePattern}"?\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(sql)
      ) {
        fail(file, `${table}: missing FORCE ROW LEVEL SECURITY`);
      }
      if (!new RegExp(`CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+"?${tablePattern}"?`, 'i').test(sql)) {
        fail(file, `${table}: missing CREATE POLICY`);
      }
    }
  }
}

if (failed) process.exit(1);
console.log('migration convention check passed');
