import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function resolveWebRoot() {
  if (process.argv[2]) return path.resolve(process.argv[2]);

  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'next.config.mjs')) && existsSync(path.join(cwd, 'public'))) {
    return cwd;
  }
  return path.join(cwd, 'apps', 'web');
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`Missing Next.js standalone asset source: ${source}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

const webRoot = resolveWebRoot();
const standaloneWebRoot = path.join(webRoot, '.next', 'standalone', 'apps', 'web');
const serverFile = path.join(standaloneWebRoot, 'server.js');

if (!existsSync(serverFile)) {
  throw new Error(`Missing Next.js standalone server: ${serverFile}`);
}

copyDirectory(path.join(webRoot, '.next', 'static'), path.join(standaloneWebRoot, '.next', 'static'));
copyDirectory(path.join(webRoot, 'public'), path.join(standaloneWebRoot, 'public'));

console.log(`prepared Next.js standalone assets for ${path.relative(process.cwd(), webRoot) || '.'}`);
