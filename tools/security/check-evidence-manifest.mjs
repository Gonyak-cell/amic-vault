import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_PROVENANCE = [
  'upstreamUrl',
  'upstreamSha',
  'upstreamTree',
  'licenseHash',
  'artifactDigest',
  'owner',
  'evidenceState',
  'modifier',
];

function fail(message) {
  throw new Error(`oss provenance validation failed: ${message}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fileExists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function listedPackageManifests(repoRoot) {
  const paths = ['package.json'];
  for (const directory of ['apps', 'packages']) {
    const absolute = join(repoRoot, directory);
    try {
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const candidate = join(directory, entry.name, 'package.json');
        if (entry.isDirectory() && fileExists(join(repoRoot, candidate))) paths.push(candidate);
      }
    } catch {
      // An absent workspace root has no direct package manifests.
    }
  }
  return paths.sort();
}

function extractPythonRequirements(text, section) {
  const start = text.indexOf(`${section} = [`);
  if (start < 0) return [];
  const end = text.indexOf(']', start);
  assert(end >= 0, `${section}: unterminated TOML array`);
  return [...text.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function pythonName(requirement) {
  return requirement.split(/[<>=!~ ]/u, 1)[0];
}

function sourceFor(config, kind, inputKey) {
  const override = config.overrides?.[inputKey] ?? {};
  return { ...config.upstreamDefaults[kind], ...override };
}

function validateSource(source, input) {
  for (const key of REQUIRED_PROVENANCE) {
    assert(typeof source[key] === 'string' && source[key].trim(), `${input.inputKey}: missing ${key}`);
  }
  assert(['UNRESOLVED', 'VERIFIED'].includes(source.evidenceState), `${input.inputKey}: invalid evidenceState`);
  if (source.evidenceState === 'VERIFIED') {
    assert(SHA.test(source.upstreamSha), `${input.inputKey}: verified upstreamSha must be 40 hex`);
    assert(SHA.test(source.upstreamTree), `${input.inputKey}: verified upstreamTree must be 40 hex`);
    assert(source.licenseHash !== 'unresolved', `${input.inputKey}: verified licenseHash unresolved`);
  }
  if (input.kind === 'image' && source.evidenceState === 'VERIFIED') {
    assert(input.reference.includes('@sha256:'), `${input.inputKey}: verified image must use digest reference`);
    assert(DIGEST.test(source.artifactDigest), `${input.inputKey}: verified image artifactDigest invalid`);
  }
}

function collectInputs(repoRoot, config) {
  const inventory = config.inventory;
  const expectedManifests = [...inventory.nodePackageManifests].sort();
  const discoveredManifests = listedPackageManifests(repoRoot);
  assert(JSON.stringify(expectedManifests) === JSON.stringify(discoveredManifests), 'node package manifest inventory drift');
  assert(fileExists(join(repoRoot, inventory.nodeLockfile)), 'node lockfile missing');

  const inputs = [];
  for (const manifestPath of expectedManifests) {
    const manifest = readJson(join(repoRoot, manifestPath));
    for (const dependencyScope of ['dependencies', 'devDependencies']) {
      for (const [name, declaredVersion] of Object.entries(manifest[dependencyScope] ?? {})) {
        const kind = declaredVersion.startsWith('workspace:') ? 'workspace' : 'npm';
        const inputKey = `${kind}:${manifestPath}:${name}`;
        inputs.push({
          inputKey,
          kind,
          name,
          declaredVersion,
          manifestPath,
          fileInclusion: [manifestPath, inventory.nodeLockfile],
          ...sourceFor(config, kind, inputKey),
        });
      }
    }
  }

  const pythonPath = join(repoRoot, inventory.pythonProject);
  assert(fileExists(pythonPath), 'python project missing');
  const python = readFileSync(pythonPath, 'utf8');
  for (const requirement of [
    ...extractPythonRequirements(python, 'dependencies'),
    ...extractPythonRequirements(python, 'test'),
    ...extractPythonRequirements(python, 'requires'),
  ]) {
    const name = pythonName(requirement);
    const inputKey = `python:${inventory.pythonProject}:${name}`;
    inputs.push({
      inputKey,
      kind: 'python',
      name,
      declaredVersion: requirement,
      manifestPath: inventory.pythonProject,
      fileInclusion: [inventory.pythonProject],
      ...sourceFor(config, 'python', inputKey),
    });
  }

  for (const dockerfile of inventory.dockerfiles) {
    const dockerfilePath = join(repoRoot, dockerfile);
    assert(fileExists(dockerfilePath), `${dockerfile}: missing Dockerfile`);
    const references = readFileSync(dockerfilePath, 'utf8')
      .split('\n')
      .map((line) => line.match(/^\s*FROM\s+([^\s]+)(?:\s+AS\s+\S+)?\s*$/iu)?.[1])
      .filter(Boolean);
    assert(references.length > 0, `${dockerfile}: no base image`);
    references.forEach((reference, index) => {
      const inputKey = `image:${dockerfile}:${index + 1}`;
      inputs.push({
        inputKey,
        kind: 'image',
        name: basename(reference.split('@', 1)[0]),
        reference,
        manifestPath: dockerfile,
        fileInclusion: [dockerfile],
        ...sourceFor(config, 'image', inputKey),
      });
    });
  }
  return inputs.sort((left, right) => left.inputKey.localeCompare(right.inputKey));
}

function validateEvidenceSchema(schema) {
  const required = ['pack', 'tuw', 'sourceSha', 'sourceTree', 'upstreamInputs', 'commands', 'artifacts', 'truthState', 'syntheticOnly', 'externalEvidence'];
  const upstreamRequired = ['inputKey', 'kind', 'manifestPath', 'fileInclusion', ...REQUIRED_PROVENANCE];
  for (const field of required) assert(schema.required?.includes(field), `evidence schema missing ${field}`);
  for (const field of upstreamRequired) assert(schema.upstreamInputRequired?.includes(field), `evidence schema missing upstream ${field}`);
  assert(Array.isArray(schema.truthStates) && schema.truthStates.includes('EXTERNAL_BLOCKED'), 'evidence schema truth states invalid');
}

export function validateInventory({ repoRoot = process.cwd(), provenancePath = 'security/oss-provenance.yml', evidenceSchemaPath = 'security/oss-evidence-schema.json' } = {}) {
  const resolvedRoot = resolve(repoRoot);
  const config = readJson(resolve(resolvedRoot, provenancePath));
  const schema = readJson(resolve(resolvedRoot, evidenceSchemaPath));
  assert(config.schemaVersion === 'oss-provenance-v1', 'unsupported provenance schemaVersion');
  assert(SHA.test(config.baseline?.sourceSha), 'baseline sourceSha must be 40 hex');
  assert(SHA.test(config.baseline?.sourceTree), 'baseline sourceTree must be 40 hex');
  validateEvidenceSchema(schema);
  for (const kind of ['npm', 'workspace', 'python', 'image']) assert(config.upstreamDefaults?.[kind], `missing ${kind} default`);
  const inputs = collectInputs(resolvedRoot, config);
  const seen = new Set();
  for (const input of inputs) {
    assert(!seen.has(input.inputKey), `duplicate input ${input.inputKey}`);
    seen.add(input.inputKey);
    assert(Array.isArray(input.fileInclusion) && input.fileInclusion.length > 0, `${input.inputKey}: fileInclusion missing`);
    validateSource(input, input);
  }
  return {
    baseline: config.baseline,
    inputCount: inputs.length,
    unresolvedCount: inputs.filter((input) => input.evidenceState === 'UNRESOLVED').length,
    inputs,
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [provenancePath = 'security/oss-provenance.yml', evidenceSchemaPath = 'security/oss-evidence-schema.json'] = process.argv.slice(2);
  const result = validateInventory({ provenancePath, evidenceSchemaPath });
  console.log(JSON.stringify({
    status: 'ok',
    baseline: result.baseline,
    inputCount: result.inputCount,
    unresolvedCount: result.unresolvedCount,
  }, null, 2));
}
