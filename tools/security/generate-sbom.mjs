import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SYFT_VERSION = '1.44.0';
const SYFT_COMMIT = '8cb78ce40ced6a731fb83f2a491a67444f541bf1';
const SOURCE_EXCLUDES = ['**/.git/**', '**/node_modules/**', '**/.next/**', '**/artifacts/**'];

function fail(message) {
  throw new Error(`SBOM generation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

export function assertSourceIdentity({ sourceSha, sourceTree }) {
  assert(SHA.test(sourceSha), 'sourceSha must be 40 lower-case hex');
  assert(SHA.test(sourceTree), 'sourceTree must be 40 lower-case hex');
}

export function parseImageSpec(value) {
  const separator = value.indexOf('=');
  assert(separator > 0, `image must use name=docker:sha256:<digest>: ${value}`);
  const name = value.slice(0, separator);
  const reference = value.slice(separator + 1);
  assert(/^[a-z][a-z0-9-]*$/u.test(name), `invalid image name: ${name}`);
  assert(reference.startsWith('docker:sha256:'), `${name}: local image must use docker:sha256 digest identity`);
  const digest = reference.slice('docker:'.length);
  assert(DIGEST.test(digest), `${name}: image digest must be sha256:64hex`);
  return { name, reference, digest };
}

export function normalizedComponents(cycloneDx) {
  assert(cycloneDx?.bomFormat === 'CycloneDX', 'CycloneDX bomFormat is required');
  assert(Array.isArray(cycloneDx.components), 'CycloneDX components array is required');
  const byPurl = new Map();
  for (const component of cycloneDx.components) {
    assert(typeof component?.name === 'string' && component.name, 'component name is required');
    // CycloneDX file components legitimately have no purl. They are retained in
    // the raw ignored SBOM but excluded from the package identity set.
    if (typeof component?.purl !== 'string' || !component.purl) continue;
    const purlVersion = component.purl.match(/@([^?]+)/u)?.[1];
    const version = typeof component.version === 'string' && component.version ? component.version : purlVersion ?? 'UNRESOLVED';
    const normalized = { type: component.type ?? 'library', name: component.name, version, purl: component.purl };
    const prior = byPurl.get(normalized.purl);
    assert(!prior || JSON.stringify(prior) === JSON.stringify(normalized), `conflicting duplicate component purl: ${normalized.purl}`);
    byPurl.set(normalized.purl, normalized);
  }
  return [...byPurl.values()].sort((left, right) => left.purl.localeCompare(right.purl));
}

export function normalizedComponentHash(cycloneDx) {
  return sha256(`${JSON.stringify(normalizedComponents(cycloneDx))}\n`);
}

export function verifySyft(binary, run = spawnSync) {
  const result = run(binary, ['version'], { encoding: 'utf8' });
  assert(result.status === 0, `Syft version command failed: ${result.stderr ?? ''}`);
  assert(result.stdout.includes(`Version:       ${SYFT_VERSION}`), `expected Syft ${SYFT_VERSION}`);
  assert(result.stdout.includes(`GitCommit:     ${SYFT_COMMIT}`), 'Syft GitCommit does not match source pin');
}

function runSyft({ binary, source, output, run = spawnSync }) {
  const result = run(binary, [
    'scan',
    source,
    '--quiet',
    '--output',
    `cyclonedx-json=${output}`,
    ...SOURCE_EXCLUDES.flatMap((exclude) => ['--exclude', exclude]),
  ], { encoding: 'utf8' });
  assert(result.status === 0, `Syft scan failed for ${source}: ${result.stderr ?? ''}`);
  assert(existsSync(output), `Syft did not write ${output}`);
  return JSON.parse(readFileSync(output, 'utf8'));
}

function repoIdentity(repoRoot) {
  const runGit = (args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  const sha = runGit(['rev-parse', 'HEAD']);
  const tree = runGit(['rev-parse', 'HEAD^{tree}']);
  assert(sha.status === 0 && tree.status === 0, 'cannot resolve repository source identity');
  return { sourceSha: sha.stdout.trim(), sourceTree: tree.stdout.trim() };
}

export function generateSbomBundle({ repoRoot = process.cwd(), outDir, syftBinary, images = [], run = spawnSync } = {}) {
  assert(typeof outDir === 'string' && outDir, 'outDir is required');
  assert(typeof syftBinary === 'string' && syftBinary, 'syftBinary is required');
  const root = resolve(repoRoot);
  const identity = repoIdentity(root);
  assertSourceIdentity(identity);
  verifySyft(syftBinary, run);
  const parsedImages = images.map(parseImageSpec);
  assert(new Set(parsedImages.map((image) => image.name)).size === parsedImages.length, 'image names must be unique');
  mkdirSync(outDir, { recursive: true });
  const sources = [{ name: 'source', reference: `dir:${root}` }, ...parsedImages];
  const sboms = sources.map(({ name, reference, digest }) => {
    const path = resolve(outDir, `${name}.cdx.json`);
    const document = runSyft({ binary: syftBinary, source: reference, output: path, run });
    return {
      name,
      reference,
      imageDigest: digest ?? null,
      file: `${name}.cdx.json`,
      fileSha256: sha256(readFileSync(path)),
      normalizedComponentHash: normalizedComponentHash(document),
      componentCount: normalizedComponents(document).length,
    };
  });
  const manifest = {
    schema: 'amic-vault.sbom-manifest.v1',
    tool: { name: 'syft', version: SYFT_VERSION, sourceCommit: SYFT_COMMIT },
    ...identity,
    sboms,
  };
  writeFileSync(resolve(outDir, 'sbom-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function parseArgs(args) {
  const result = { images: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--out') result.outDir = args[++index];
    else if (value === '--syft') result.syftBinary = args[++index];
    else if (value === '--image') result.images.push(args[++index]);
    else fail(`unknown argument: ${value}`);
  }
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const manifest = generateSbomBundle(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ status: 'ok', sourceSha: manifest.sourceSha, sourceTree: manifest.sourceTree, sbomCount: manifest.sboms.length }, null, 2));
}
