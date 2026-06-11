#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { releaseRank, requiredFields, violatesReleaseBan } from './rules.mjs';

function fail(message) {
  console.error(`backlog validation failed: ${message}`);
  process.exitCode = 1;
}

function parseCsv(input) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const text = input.replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  if (inQuotes) {
    throw new Error('unterminated quoted CSV field');
  }

  const [header, ...body] = rows;
  if (!header) {
    return [];
  }

  return body.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(`row ${rowIndex + 2} has ${values.length} fields; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
}

function normalizeDeps(value) {
  if (!value) {
    return [];
  }
  return value
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateSchema(rows) {
  for (const field of requiredFields) {
    if (!(field in (rows[0] ?? {}))) {
      fail(`missing required field ${field}`);
    }
  }

  const validRisk = new Set(['L', 'M', 'H', 'C']);
  const validSize = new Set(['S', 'M', 'L']);
  for (const row of rows) {
    if (!row.work_id) fail('row has empty work_id');
    if (!validRisk.has(row.risk)) fail(`${row.work_id}: invalid risk ${row.risk}`);
    if (!validSize.has(row.size)) fail(`${row.work_id}: invalid size ${row.size}`);
    try {
      releaseRank(row.release);
    } catch (error) {
      fail(`${row.work_id}: ${error.message}`);
    }
  }
}

function validateUniqueIds(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.work_id)) {
      fail(`duplicate work_id ${row.work_id}`);
    }
    seen.add(row.work_id);
  }
}

function validateDeps(rows) {
  const byId = new Map(rows.map((row) => [row.work_id, row]));
  const graph = new Map(rows.map((row) => [row.work_id, normalizeDeps(row.depends_on)]));

  for (const row of rows) {
    for (const dep of graph.get(row.work_id) ?? []) {
      if (!byId.has(dep)) {
        fail(`${row.work_id}: missing depends_on target ${dep}`);
        continue;
      }
      const depRow = byId.get(dep);
      if (releaseRank(depRow.release) > releaseRank(row.release)) {
        fail(`${row.work_id}: depends on later release ${dep}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();

  function walk(id, stack) {
    if (visiting.has(id)) {
      fail(`cycle detected: ${[...stack, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      walk(dep, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const row of rows) {
    walk(row.work_id, []);
  }
}

function validateReleaseBans(rows) {
  for (const row of rows) {
    const violation = violatesReleaseBan(row);
    if (violation) {
      fail(`${row.work_id}: ${violation}`);
    }
  }
}

function validateJsonParity(csvPath, csvRows) {
  const jsonPath = csvPath.replace(/\.csv$/u, '.json');
  if (!fs.existsSync(jsonPath)) {
    fail(`JSON companion missing: ${jsonPath}`);
    return;
  }
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const tuws = Array.isArray(json.tuws) ? json.tuws : [];
  if (json.total !== csvRows.length || tuws.length !== csvRows.length) {
    fail(`CSV/JSON row count mismatch: csv=${csvRows.length} json=${tuws.length} total=${json.total}`);
  }

  const jsonById = new Map(tuws.map((row) => [row.id, row]));
  for (const row of csvRows) {
    const counterpart = jsonById.get(row.work_id);
    if (!counterpart) {
      fail(`${row.work_id}: missing from JSON companion`);
      continue;
    }
    for (const field of ['title', 'release', 'module', 'risk', 'size']) {
      if (counterpart[field] !== row[field]) {
        fail(`${row.work_id}: JSON ${field} mismatch`);
      }
    }
    const csvDeps = normalizeDeps(row.depends_on);
    const jsonDeps = Array.isArray(counterpart.depends_on) ? counterpart.depends_on : [];
    if (csvDeps.join('|') !== jsonDeps.join('|')) {
      fail(`${row.work_id}: JSON depends_on mismatch`);
    }
  }
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: node tools/backlog/validate.mjs <backlog.csv>');
  process.exit(2);
}

const resolved = path.resolve(csvPath);
const rows = parseCsv(fs.readFileSync(resolved, 'utf8'));
validateSchema(rows);
validateUniqueIds(rows);
validateDeps(rows);
validateReleaseBans(rows);
validateJsonParity(resolved, rows);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`backlog validation passed: ${rows.length} TUWs`);
