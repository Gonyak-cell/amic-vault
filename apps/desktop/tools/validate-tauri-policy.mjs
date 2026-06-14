import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const signedLocal = readJson('src-tauri/config/local.signed.json');
const cargoToml = readText('src-tauri/Cargo.toml');
const main = readText('src-tauri/src/main.rs');
const origin = readText('src-tauri/src/origin.rs');

assert(Array.isArray(tauriConfig.app?.windows), 'Tauri config must declare windows');
assert(tauriConfig.app.windows.length === 0, 'No default Tauri window may bypass origin config');
assert(
  JSON.stringify(tauriConfig.app?.security?.capabilities) === JSON.stringify(['vault-thin-shell']),
  'Tauri config must use only vault-thin-shell capability',
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
  'tauri-plugin-updater',
  'Command::new',
  'read_dir',
  'write_file',
]) {
  assert(
    !`${cargoToml}\n${main}\n${origin}`.includes(marker),
    `Forbidden desktop native marker present: ${marker}`,
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
