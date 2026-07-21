import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'apps', 'web', 'public', 'word-addin', 'manifest.xml');
const defaultOutPath = path.join(repoRoot, '.artifacts', 'word-addin', 'manifest.xml');
const developmentOrigin = 'https://localhost:3000';

function argValue(name) {
  const prefixed = `${name}=`;
  const directIndex = process.argv.indexOf(name);
  if (directIndex >= 0) return process.argv[directIndex + 1];
  const pair = process.argv.find((arg) => arg.startsWith(prefixed));
  return pair ? pair.slice(prefixed.length) : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeOrigin(value) {
  if (!value) throw new Error('Missing --origin or WORD_ADDIN_ORIGIN');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('Word add-in origin must use https');
  if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && !hasArg('--allow-localhost')) {
    throw new Error('Localhost origins require --allow-localhost');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Word add-in origin must be an origin only, without path, query, or hash');
  }
  return parsed.origin;
}

function resolveOutPath(value) {
  const resolved = path.resolve(value ?? defaultOutPath);
  if (resolved === sourcePath) throw new Error('Refusing to overwrite the committed development manifest');
  return resolved;
}

const origin = normalizeOrigin(argValue('--origin') ?? process.env.WORD_ADDIN_ORIGIN);
const outPath = resolveOutPath(argValue('--out'));

if (!existsSync(sourcePath)) throw new Error(`Missing committed Word manifest: ${sourcePath}`);

const source = readFileSync(sourcePath, 'utf8');
const rendered = source.replaceAll(developmentOrigin, origin);

if (rendered.includes(developmentOrigin) && origin !== developmentOrigin) {
  throw new Error('Rendered manifest still contains the development origin');
}
if (!rendered.includes('<Host Name="Document"/>')) {
  throw new Error('Rendered manifest lost the Word document host');
}
if (!rendered.includes('<Permissions>ReadWriteDocument</Permissions>')) {
  throw new Error('Rendered manifest lost the document write permission boundary');
}
for (const forbidden of ['Mailbox', 'ReadWriteMailbox', 'Mail.Send', 'WebApplicationInfo']) {
  if (rendered.includes(forbidden)) throw new Error(`Rendered manifest contains ${forbidden}`);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, rendered);

const sha256 = createHash('sha256').update(rendered).digest('hex');
console.log(
  JSON.stringify({
    status: 'rendered',
    outPath: path.relative(repoRoot, outPath),
    sha256,
    sensitiveValuesPrinted: false,
  }),
);
