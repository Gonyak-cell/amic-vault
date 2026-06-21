import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const desktopRoot = join(root, 'apps/desktop');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(desktopRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(join(desktopRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = readJson('src-tauri/tauri.conf.json');
const capability = readJson('src-tauri/capabilities/vault-thin-shell.json');
const capabilityFiles = readdirSync(join(desktopRoot, 'src-tauri/capabilities'))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const source = [
  readText('src-tauri/Cargo.toml'),
  readText('src-tauri/src/main.rs'),
  readText('src-tauri/src/origin.rs'),
  readText('src-tauri/src/origin_guard.rs'),
].join('\n');

assert(
  JSON.stringify(config.app?.security?.capabilities) === JSON.stringify(['vault-thin-shell']),
  'Desktop must use only vault-thin-shell capability',
);
assert(
  JSON.stringify(capabilityFiles) === JSON.stringify(['vault-thin-shell.json']),
  'Desktop must not add extra capability files without ADR approval',
);
assert(capability.identifier === 'vault-thin-shell', 'Capability identifier must be stable');
assert(Array.isArray(capability.permissions), 'Capability permissions must be declared');
assert(capability.permissions.length === 0, 'Native permissions must remain empty');

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
  assert(!source.includes(marker), `Forbidden desktop native marker present: ${marker}`);
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
    `Forbidden capability permission marker present: ${marker}`,
  );
}

console.log('Desktop capability policy verified.');
