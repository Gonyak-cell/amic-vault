import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tauriConfig = readJson('src-tauri/tauri.conf.json');
const capability = readJson('src-tauri/capabilities/vault-thin-shell.json');
const capabilityFiles = readdirSync(join(root, 'src-tauri/capabilities'))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const signedLocal = readJson('src-tauri/config/local.signed.json');
const cargoToml = readText('src-tauri/Cargo.toml');
const main = readText('src-tauri/src/main.rs');
const origin = readText('src-tauri/src/origin.rs');
const originGuard = readText('src-tauri/src/origin_guard.rs');

assert(Array.isArray(tauriConfig.app?.windows), 'Tauri config must declare windows');
assert(tauriConfig.app.windows.length === 0, 'No default Tauri window may bypass origin config');
assert(
  JSON.stringify(tauriConfig.app?.security?.capabilities) === JSON.stringify(['vault-thin-shell']),
  'Tauri config must use only vault-thin-shell capability',
);
assert(
  JSON.stringify(capabilityFiles) === JSON.stringify(['vault-thin-shell.json']),
  'Desktop must not add extra capability files without ADR approval',
);
assert(
  capability.identifier === 'vault-thin-shell',
  'Capability identifier must remain vault-thin-shell',
);
assert(Array.isArray(capability.permissions), 'Capability file must declare permissions');
assert(capability.permissions.length === 0, 'Thin shell capability permissions must remain empty');
assert(
  tauriConfig.bundle?.targets?.length === 1 && tauriConfig.bundle.targets[0] === 'app',
  'Phase 3 must build app bundle only',
);

for (const marker of [
  'tauri-plugin-fs',
  'tauri-plugin-shell',
  'tauri-plugin-dialog',
  'tauri-plugin-clipboard',
  'tauri-plugin-notification',
  'tauri-plugin-global-shortcut',
  'tauri-plugin-opener',
  'tauri-plugin-updater',
  'plugin(',
  'Command::new',
  'read_dir',
  'write_file',
  'shell::open',
  'open_path',
]) {
  assert(
    !`${cargoToml}\n${main}\n${origin}\n${originGuard}`.includes(marker),
    `Forbidden desktop native marker present: ${marker}`,
  );
}

for (const marker of [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'CacheStorage',
  'caches.open',
  'document.cookie',
  'tauri-plugin-store',
  'tauri-plugin-sql',
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
]) {
  assert(
    !`${cargoToml}\n${main}\n${origin}\n${originGuard}`.includes(marker),
    `Forbidden desktop local authority marker present: ${marker}`,
  );
}

for (const marker of [
  'fs:',
  'clipboard',
  'dialog',
  'shell',
  'notification',
  'global-shortcut',
  'opener',
  'share',
  'mail',
]) {
  assert(
    !JSON.stringify(capability.permissions).includes(marker),
    `Forbidden native permission marker present: ${marker}`,
  );
}

const spkiDer = Buffer.from(
  'MCowBQYDK2VwAyEAy3uFqTX+HBSpd+fJ7p2RdFjIkkVyvhnKWEGGabCCWmE=',
  'base64',
);
const key = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
const payload = Buffer.from(
  `schemaVersion=${signedLocal.schemaVersion}\nreleaseChannel=${signedLocal.releaseChannel}\noriginRef=${signedLocal.originRef}\norigin=${signedLocal.origin}\n`,
);
assert(
  verify(null, payload, key, Buffer.from(signedLocal.signature, 'base64')),
  'Signed local origin fixture must verify',
);
assert(
  signedLocal.origin === 'http://localhost:3000',
  'Local fixture must not contain private endpoint values',
);
assert(
  origin.includes('AMIC_VAULT_DESKTOP_ORIGIN_CONFIG'),
  'Origin config path must come from env',
);
assert(
  origin.includes('origin config signature verification failed'),
  'Origin config must fail closed on bad signatures',
);

console.log('Desktop Tauri policy verified.');
