import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const policyPath = 'security/telemetry-data-policy.yml';
const sensitiveIdentifierKeys = new Set([
  'authorization', 'body', 'content', 'cookie', 'document', 'documentid', 'email', 'emailid',
  'file', 'fileid', 'filename', 'matter', 'matterid', 'node', 'nodeid', 'password', 'prompt',
  'query', 'snippet', 'sql', 'storage', 'storagekey', 'storageuri', 'tenant', 'tenantid', 'text',
  'token', 'user', 'userid', 'version', 'versionid',
]);
const loggerCallPattern = /(?:this\.)?logger\.(?:log|warn|error|debug|verbose)\s*\(\s*\{([\s\S]{0,1200}?)\}\s*(?:,|\))/gu;
const fieldPattern = /(?:^|[,\n{])\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*:/gu;
const shorthandFieldPattern = /(?:^|[,\n{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=,|$|\n)/gu;
const telemetryCallPattern = /(?:\bspan\.setAttribute\s*\(\s*['"]([^'"]+)|\b(?:this\.)?(?:registry|metrics)\.(?:observe|record[A-Z][A-Za-z]*)\s*\(\s*\{([\s\S]{0,1200}?)\})/gu;

function fail(message) {
  throw new Error(`telemetry policy check failed: ${message}`);
}

function walk(root, extensions, excludedSuffixes) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return walk(path, extensions, excludedSuffixes);
    if (!entry.isFile()) return [];
    if (!extensions.some((extension) => entry.name.endsWith(extension))) return [];
    if (excludedSuffixes.some((suffix) => entry.name.endsWith(suffix))) return [];
    return [path];
  });
}

function collectObjectKeys(text) {
  return [
    ...text.matchAll(fieldPattern).map((match) => match[1]),
    ...text.matchAll(shorthandFieldPattern).map((match) => match[1]),
  ].filter(Boolean);
}

function isSensitiveIdentifierKey(key) {
  return sensitiveIdentifierKeys.has(key.replace(/[._-]/gu, '').toLowerCase());
}

function collectRawIdentifierLogFields(source) {
  const fields = [];
  for (const call of source.text.matchAll(loggerCallPattern)) {
    for (const key of collectObjectKeys(call[1] ?? '')) {
      if (isSensitiveIdentifierKey(key)) fields.push({ path: source.path, key });
    }
  }
  return fields;
}

function collectTelemetryCallsites(source) {
  const callsites = [];
  for (const call of source.text.matchAll(telemetryCallPattern)) {
    const directKey = call[1];
    const objectKeys = directKey ? [directKey] : collectObjectKeys(call[2] ?? '');
    for (const key of objectKeys) callsites.push({ path: source.path, key });
  }
  return callsites;
}

function countFields(fields) {
  return Object.fromEntries(
    [...fields.reduce((counts, field) => {
      const key = `${field.path}\t${field.key}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map())]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => [key, count]),
  );
}

function baselineCounts(policy) {
  return Object.fromEntries(
    (policy.legacyIdentifierLogBaseline ?? []).map((entry) => [`${entry.path}\t${entry.key}`, entry.count]),
  );
}

export function inspectTelemetryPolicy({ policy, sources }) {
  const canaryLocations = [];
  const rawIdentifierLogFields = sources.flatMap(collectRawIdentifierLogFields);
  const telemetryCallsites = sources.flatMap(collectTelemetryCallsites);
  const rawTelemetryFields = telemetryCallsites.filter((field) => isSensitiveIdentifierKey(field.key));
  for (const source of sources) {
    for (const token of policy.canaryTokens) {
      if (source.text.includes(token)) canaryLocations.push({ path: source.path, token });
    }
  }
  return {
    schemaVersion: 'amic-vault.telemetry-policy-report.v1',
    status: 'PASS',
    canaryLocations,
    rawIdentifierLogFields: countFields(rawIdentifierLogFields),
    rawTelemetryFields: countFields(rawTelemetryFields),
    telemetryCallsiteInventory: countFields(telemetryCallsites),
  };
}

export function validateTelemetryPolicy({ policy, sources }) {
  const report = inspectTelemetryPolicy({ policy, sources });
  if (report.canaryLocations.length > 0) fail(`sensitive canary found: ${JSON.stringify(report.canaryLocations)}`);
  if (Object.keys(report.rawTelemetryFields).length > 0) {
    fail(`raw identifier telemetry field found: ${JSON.stringify(report.rawTelemetryFields)}`);
  }
  const baseline = baselineCounts(policy);
  for (const [key, count] of Object.entries(report.rawIdentifierLogFields)) {
    if ((baseline[key] ?? 0) < count) fail(`unbaselined raw identifier log field: ${key} x${count}`);
  }
  return report;
}

function loadSources(policy) {
  return policy.scanner.roots.flatMap((root) =>
    walk(resolve(root), policy.scanner.extensions, policy.scanner.excludedSuffixes).map((file) => ({
      path: relative(process.cwd(), file),
      text: readFileSync(file, 'utf8'),
    })),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const policy = JSON.parse(readFileSync(resolve(policyPath), 'utf8'));
    const report = process.argv.includes('--report-only')
      ? inspectTelemetryPolicy({ policy, sources: loadSources(policy) })
      : validateTelemetryPolicy({ policy, sources: loadSources(policy) });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`TELEMETRY_POLICY_INVALID: ${error.message}\n`);
    process.exitCode = 1;
  }
}
