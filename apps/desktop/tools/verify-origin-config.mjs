import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, join } from 'node:path';

const signingPublicKeyB64 = 'y3uFqTX+HBSpd+fJ7p2RdFjIkkVyvhnKWEGGabCCWmE=';
const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const desktopRoot = new URL('..', import.meta.url).pathname;
const repoRoot = join(desktopRoot, '..', '..');

function fail(message) {
  console.error(`AMIC_VAULT_DESKTOP_ORIGIN_CONFIG_INVALID: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfig(configPath) {
  const candidatePaths = isAbsolute(configPath)
    ? [configPath]
    : [configPath, join(desktopRoot, configPath), join(repoRoot, configPath)];
  const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
  assert(resolvedPath, 'config path does not exist');

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    fail(`failed to read or parse config: ${error.message}`);
  }
  assert(isRecord(parsed), 'config must be a JSON object');
  return parsed;
}

function stringField(config, key) {
  const value = config[key];
  assert(typeof value === 'string' && value.length > 0, `${key} must be a non-empty string`);
  return value;
}

function signaturePayload(config) {
  return Buffer.from(
    `schemaVersion=${config.schemaVersion}\nreleaseChannel=${config.releaseChannel}\noriginRef=${config.originRef}\norigin=${config.origin}\n`,
  );
}

function verifySignature(config) {
  const key = createPublicKey({
    key: Buffer.concat([spkiPrefix, Buffer.from(signingPublicKeyB64, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  assert(
    verify(null, signaturePayload(config), key, Buffer.from(config.signature, 'base64')),
    'signature verification failed',
  );
}

function validateOriginRef(originRef) {
  assert(originRef.length >= 2 && originRef.length <= 120, 'originRef length is invalid');
  assert(/^[A-Z0-9._/-]+$/.test(originRef), 'originRef contains unsupported characters');
}

function validateOriginUrl(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch (error) {
    fail(`invalid origin URL: ${error.message}`);
  }
  assert(url.username === '' && url.password === '', 'origin URL must not contain credentials');
  assert(url.search === '' && url.hash === '', 'origin URL must not contain query or fragment');
  assert(url.pathname === '/', 'origin URL must be an origin, not an application path');
  return url;
}

function isLocalHttpOrigin(url) {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.port !== ''
  );
}

function isPrivateOrLocalRemote(url) {
  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (isIP(host) === 6) {
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80')
    );
  }

  return false;
}

function isExternalIdentityProvider(url) {
  const host = url.hostname.toLowerCase();
  return [
    'login.microsoftonline.com',
    'accounts.google.com',
    'login.okta.com',
    'okta.com',
    'auth0.com',
  ].some((idpHost) => host === idpHost || host.endsWith(`.${idpHost}`));
}

function requirePublicHttps(url, channel) {
  assert(url.protocol === 'https:', `${channel} origin must use https`);
  assert(!isPrivateOrLocalRemote(url), `${channel} origin must not be private or local`);
  assert(
    !isExternalIdentityProvider(url),
    `${channel} origin must not be an external identity provider`,
  );
}

function validateChannelPolicy(config) {
  const releaseChannel = stringField(config, 'releaseChannel');
  const originRef = stringField(config, 'originRef');
  const origin = stringField(config, 'origin');
  validateOriginRef(originRef);
  const url = validateOriginUrl(origin);

  if (releaseChannel === 'local') {
    assert(originRef === 'LOCAL-DEV', 'local origin config must use LOCAL-DEV originRef');
    assert(
      isLocalHttpOrigin(url),
      'local origin must be localhost or 127.0.0.1 with an explicit port',
    );
    return;
  }
  if (releaseChannel === 'staging') {
    assert(originRef.startsWith('STAGE-'), 'staging originRef must start with STAGE-');
    requirePublicHttps(url, releaseChannel);
    return;
  }
  if (releaseChannel === 'pilot') {
    assert(originRef.startsWith('PILOT-'), 'pilot originRef must start with PILOT-');
    requirePublicHttps(url, releaseChannel);
    return;
  }
  if (releaseChannel === 'production') {
    assert(originRef.startsWith('PROD-'), 'production originRef must start with PROD-');
    requirePublicHttps(url, releaseChannel);
    return;
  }
  fail('releaseChannel must be local, staging, pilot, or production');
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const configPath = args[0];
if (!configPath || args.includes('--help')) {
  console.error('Usage: node tools/verify-origin-config.mjs <signed-origin-config.json>');
  process.exit(configPath ? 0 : 1);
}

const config = readConfig(configPath);
assert(config.schemaVersion === 1, 'schemaVersion must be 1');
stringField(config, 'signature');
verifySignature(config);
validateChannelPolicy(config);
console.log('Desktop origin config verified.');
