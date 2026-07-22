import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.mjs', '.cjs', '.js']);

function fail(message) {
  throw new Error(`database authority check failed: ${message}`);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function walk(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) files.push(path);
  }
  return files.sort();
}

function importedConstructors(sourceFile) {
  const pools = new Set();
  const clients = new Set();
  const bosses = new Set();
  const pgNamespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (moduleName === 'pg' && clause.name) pgNamespaces.add(clause.name.text);
    if (moduleName === 'pg-boss' && clause.name) bosses.add(clause.name.text);
    for (const item of clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : []) {
      if (item.isTypeOnly) continue;
      const imported = item.propertyName?.text ?? item.name.text;
      if (moduleName === 'pg' && imported === 'Pool') pools.add(item.name.text);
      if (moduleName === 'pg' && imported === 'Client') clients.add(item.name.text);
      if (moduleName === 'pg-boss' && imported === 'PgBoss') bosses.add(item.name.text);
    }
    if (moduleName === 'pg' && clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) pgNamespaces.add(clause.namedBindings.name.text);
  }
  const collectDynamicImport = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(initializer)
        && initializer.expression.kind === ts.SyntaxKind.ImportKeyword
        && ts.isStringLiteral(initializer.arguments[0])) {
        const moduleName = initializer.arguments[0].text;
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const imported = element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile);
            if (moduleName === 'pg' && imported === 'Pool') pools.add(element.name.getText(sourceFile));
            if (moduleName === 'pg' && imported === 'Client') clients.add(element.name.getText(sourceFile));
            if (moduleName === 'pg-boss' && imported === 'PgBoss') bosses.add(element.name.getText(sourceFile));
          }
        } else if (ts.isIdentifier(node.name) && moduleName === 'pg') pgNamespaces.add(node.name.text);
      }
    }
    ts.forEachChild(node, collectDynamicImport);
  };
  collectDynamicImport(sourceFile);
  return { pools, clients, bosses, pgNamespaces };
}

function constructorKind(node, imports) {
  if (ts.isIdentifier(node.expression)) {
    if (imports.pools.has(node.expression.text)) return 'Pool';
    if (imports.clients.has(node.expression.text)) return 'Client';
    if (imports.bosses.has(node.expression.text)) return 'PgBoss';
  }
  if (ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && imports.pgNamespaces.has(node.expression.expression.text)
    && ['Pool', 'Client'].includes(node.expression.name.text)) return node.expression.name.text;
  return undefined;
}

function processRole(path, kind) {
  if (path.includes('/tools/') || path.startsWith('tools/')) return 'CLI';
  if (path.endsWith('.spec.ts') || path.includes('/tests/')) return 'TEST_ONLY';
  if (kind === 'PgBoss' || /queue|scheduler|job|worker/i.test(path)) return 'API_WORKER_OR_SCHEDULER';
  return 'API_RUNTIME';
}

function migrationBatch(path, kind, role) {
  if (role === 'CLI' || role === 'TEST_ONLY') return 'CLI_EXCEPTION';
  if (kind === 'PgBoss') return 'QUE';
  if (/common\/(guards|db)|health/.test(path)) return 'DBA';
  if (/(audit|tenant|permission|auth|user|matter|client|party|ethical-wall|break-glass|document|storage|search)/.test(path)) return 'DBM';
  return 'DBR';
}

function connectionEnvironment(text) {
  const names = [...new Set([...text.matchAll(/\b(?:process\.)?env\.(DATABASE_[A-Z_]+|DATABASE_URL)\b/g)].map((match) => match[1]))];
  return names.length === 0 ? 'INDIRECT_OR_ARGUMENT' : names.sort().join(',');
}

function recordFor(node, sourceFile, path, text, imports) {
  const kind = constructorKind(node, imports);
  if (!kind) return undefined;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const role = processRole(path, kind);
  return {
    path,
    line: position.line + 1,
    constructor: kind,
    processRole: role,
    owner: path.split('/').slice(0, -1).join('/') || '.',
    connectionEnvironment: connectionEnvironment(text),
    tenantGuc: text.includes('app.current_tenant_id') ? 'LOCAL_GUC_IN_FILE' : 'CONSUMER_MUST_USE_TENANT_TRANSACTION',
    transactionAuditCoupling: /audit/.test(path) ? 'AUDIT_TRANSACTION_OWNER' : 'PRESERVE_ON_MIGRATION',
    shutdown: /\.(end|stop)\s*\(/.test(text) ? 'EXPLICIT_IN_FILE' : 'CENTRAL_LIFECYCLE_REQUIRED',
    migrationBatch: migrationBatch(path, kind, role),
  };
}

export function scanSources(sources) {
  const records = [];
  for (const { path, text } of sources) {
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const imports = importedConstructors(sourceFile);
    const visit = (node) => {
      if (ts.isNewExpression(node)) {
        const record = recordFor(node, sourceFile, path, text, imports);
        if (record) records.push(record);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return records.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.constructor.localeCompare(right.constructor));
}

export function inventoryReport(records) {
  const runtime = records.filter((record) => record.processRole !== 'CLI' && record.processRole !== 'TEST_ONLY');
  const normalized = JSON.stringify(records);
  const byBatch = Object.groupBy(records, (record) => record.migrationBatch);
  return {
    schemaVersion: 'amic-vault.database-authority-inventory.v1',
    poolCount: records.filter((record) => record.constructor === 'Pool').length,
    clientCount: records.filter((record) => record.constructor === 'Client').length,
    pgBossCount: records.filter((record) => record.constructor === 'PgBoss').length,
    runtimeCount: runtime.length,
    cliCount: records.filter((record) => record.processRole === 'CLI').length,
    unclassifiedRuntimeCount: runtime.filter((record) => !record.migrationBatch || record.migrationBatch === 'UNCLASSIFIED').length,
    inventorySha256: sha256(normalized),
    records,
    migrationBatches: Object.fromEntries(Object.entries(byBatch).map(([batch, sites]) => [batch, sites.map(({ path, line, constructor, processRole }) => ({ path, line, constructor, processRole }))])),
  };
}

function oss01Baseline(sourceMap) {
  const row = sourceMap?.productAuthorityTargets?.find((target) => target.portfolio === 'OSS-01');
  if (!row?.directConstructorBaseline) fail('OSS-01 directConstructorBaseline is missing');
  return row.directConstructorBaseline;
}

function directConnectionKey(record) {
  return `${record.path}|${record.constructor}|${record.processRole}|${record.connectionEnvironment}`;
}

function validateDirectConnectionAllowlist({ report, sourceMap }) {
  const allowlist = oss01Baseline(sourceMap).directConnectionAllowlist;
  if (!Array.isArray(allowlist)) fail('OSS-01 directConnectionAllowlist is missing');
  const approved = new Set(allowlist.map((item) =>
    `${item.path}|${item.constructor}|${item.processRole}|${item.connectionEnvironment}`,
  ));
  for (const record of report.records.filter((item) => item.constructor === 'Pool' || item.constructor === 'Client')) {
    if (!approved.has(directConnectionKey(record))) {
      fail(`unallowlisted direct ${record.constructor}: ${directConnectionKey(record)}`);
    }
  }
}

export function validateInventory({ report, sourceMap }) {
  const baseline = oss01Baseline(sourceMap);
  for (const key of ['poolCount', 'clientCount', 'pgBossCount', 'inventorySha256']) {
    if (baseline[key] !== report[key]) fail(`${key} drift: expected ${baseline[key]}, found ${report[key]}`);
  }
  if (report.unclassifiedRuntimeCount !== 0) fail(`unclassified runtime constructor site count is ${report.unclassifiedRuntimeCount}`);
  validateDirectConnectionAllowlist({ report, sourceMap });
  return { schemaVersion: 'amic-vault.database-authority-validation.v1', status: 'PASS', poolCount: report.poolCount, clientCount: report.clientCount, pgBossCount: report.pgBossCount, inventorySha256: report.inventorySha256, migrationBatches: Object.keys(report.migrationBatches).sort() };
}

function parseArgs(args) {
  const result = { roots: ['apps/api/src', 'tools/db'], sourceMap: 'security/oss-source-map.yml' };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--root') result.roots.push(args[++index]);
    else if (value === '--source-map') result.sourceMap = args[++index];
    else if (value === '--out') result.out = args[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const sources = args.roots.flatMap((root) => walk(resolve(root)).map((file) => ({ path: relative(process.cwd(), file), text: readFileSync(file, 'utf8') })));
    const report = inventoryReport(scanSources(sources));
    const validation = validateInventory({ report, sourceMap: JSON.parse(readFileSync(args.sourceMap, 'utf8')) });
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      writeFileSync(resolve(args.out, 'direct-connection-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(resolve(args.out, 'migration-batches.json'), `${JSON.stringify({ schemaVersion: report.schemaVersion, migrationBatches: report.migrationBatches }, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(validation)}\n`);
  } catch (error) {
    process.stderr.write(`DATABASE_AUTHORITY_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
