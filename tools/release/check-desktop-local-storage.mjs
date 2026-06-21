import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const desktopRoot = join(root, 'apps/desktop');

function readText(relativePath) {
  return readFileSync(join(desktopRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = [
  readText('package.json'),
  readText('src-tauri/Cargo.toml'),
  readText('src-tauri/tauri.conf.json'),
  readText('src-tauri/src/main.rs'),
  readText('src-tauri/src/origin.rs'),
  readText('src-tauri/src/origin_guard.rs'),
  readText('src-tauri/desktop-shell/index.html'),
].join('\n');
const capability = readJson('src-tauri/capabilities/vault-thin-shell.json');

assert(Array.isArray(capability.permissions), 'Capability permissions must be declared');
assert(capability.permissions.length === 0, 'Native permissions must remain empty');

for (const marker of [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'CacheStorage',
  'caches.open',
  'document.cookie',
  'tauri-plugin-store',
  'tauri-plugin-sql',
  'tauri-plugin-fs',
  'tauri-plugin-shell',
  'tauri-plugin-opener',
  'rusqlite',
  'sqlx',
  'sqlite',
  'rocksdb',
  'sled',
  'redb',
  'BaseDirectory::AppData',
  'app_data_dir',
  '/v1/documents',
  '/v1/search',
  'DOCUMENT_VIEWED',
  'DOCUMENT_DOWNLOADED',
  'document_body',
  'search_results',
  'audit_events',
]) {
  assert(!source.includes(marker), `Forbidden desktop local-storage marker present: ${marker}`);
}

console.log('Desktop local-storage policy verified.');
