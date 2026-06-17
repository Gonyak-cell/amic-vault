#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const hiddenRoutes = ['/launch', '/scale', '/contracts', '/dd', '/litigation'];
const hiddenUntilApiRoutes = ['/files', '/integrations/onedrive'];
const blockedRoutePages = new Map([
  ['/launch', 'apps/web/src/app/(app)/launch/page.tsx'],
  ['/scale', 'apps/web/src/app/(app)/scale/page.tsx'],
  ['/contracts', 'apps/web/src/app/(app)/contracts/page.tsx'],
  ['/dd', 'apps/web/src/app/(app)/dd/page.tsx'],
  ['/litigation', 'apps/web/src/app/(app)/litigation/page.tsx'],
]);

const scanRoots = ['apps/web/src/app', 'apps/web/src/components'];
const excludedFilePatterns = [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/, /\.stories\.[tj]sx?$/];

const forbiddenPatterns = [
  { name: 'raw hex color literal', pattern: /#[0-9a-f]{3,8}\b/i },
  { name: 'nullish fallback count', pattern: /\?\?\s*0\b/ },
  {
    name: 'unsafe id slice formatter',
    pattern: /\b(documentId|matterId|clientId|userId|tenantId|workspaceId)\b[^;\n]*\.slice\s*\(\s*0\s*,/i,
  },
  {
    name: 'unsafe id short hash formatter',
    pattern: /\bshortHash\s*\(\s*(status\.)?(matterId|documentId|clientId|userId|tenantId|workspaceId|selectedMatterId|selectedDocumentId)\b/i,
  },
  { name: 'workspace id visible copy', pattern: /workspace\s*id|워크스페이스 ID/i },
  { name: 'theme selector copy', pattern: /디자인 테마|design theme/i },
  { name: 'raw prompt copy', pattern: /raw prompt|prompt 원문/i },
  { name: 'raw source copy', pattern: /raw source|source text|source 원문/i },
  { name: 'model response copy', pattern: /model response|model-response|모델 응답/i },
  { name: 'external model copy', pattern: /external model|외부 모델/i },
  { name: 'legal analysis copy', pattern: /legal analysis|법률 분석/i },
];

const blockedRouteForbiddenLiterals = [
  /RFI-001/,
  /EV-001/,
  /FACT-001/,
  /DD-ISS-001/,
  /PLD-001/,
  /Witness timeline/,
  /Corporate charter documents/,
];

const findings = [];

function fail(message) {
  findings.push(message);
}

function readRequired(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function walk(directory) {
  const absoluteDirectory = path.join(repoRoot, directory);
  const files = [];
  for (const entry of readdirSync(absoluteDirectory)) {
    const filePath = path.join(absoluteDirectory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...walk(path.relative(repoRoot, filePath)));
    } else if (/\.[tj]sx?$/.test(filePath) && !excludedFilePatterns.some((pattern) => pattern.test(filePath))) {
      files.push(filePath);
    }
  }
  return files;
}

function assertRoutePolicy(featuresSource, route, production, showInNavigation) {
  const routeStart = featuresSource.indexOf(`route: '${route}'`);
  if (routeStart === -1) {
    fail(`Route visibility policy missing for ${route}`);
    return;
  }
  const nextRoute = featuresSource.indexOf('route: ', routeStart + 1);
  const block = featuresSource.slice(routeStart, nextRoute === -1 ? undefined : nextRoute);
  if (!block.includes(`production: '${production}'`)) {
    fail(`${route} must have production: '${production}'`);
  }
  if (!block.includes(`showInNavigation: ${showInNavigation}`)) {
    fail(`${route} must have showInNavigation: ${showInNavigation}`);
  }
}

function runExistingLiteralCheck() {
  execFileSync(process.execPath, ['tools/quality/check-production-ui-literals.mjs'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function scanProductionUiSources() {
  for (const root of scanRoots) {
    for (const absolutePath of walk(root)) {
      const relativePath = path.relative(repoRoot, absolutePath);
      const source = readFileSync(absolutePath, 'utf8');
      const lines = source.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const { name, pattern } of forbiddenPatterns) {
          if (pattern.test(line)) {
            fail(`${relativePath}:${index + 1} ${name}: ${line.trim()}`);
          }
        }
      }
    }
  }
}

function checkRouteVisibility() {
  const featuresSource = readRequired('apps/web/src/lib/features.ts');
  const navigationSource = readRequired('apps/web/src/lib/navigation.ts');
  for (const route of hiddenRoutes) {
    assertRoutePolicy(featuresSource, route, 'hidden', 'false');
    if (navigationSource.includes(`'${route}'`) || navigationSource.includes(`"${route}"`)) {
      fail(`${route} must not be present in routeNavigation`);
    }
  }
  for (const route of hiddenUntilApiRoutes) {
    assertRoutePolicy(featuresSource, route, 'hidden_until_api_ready', 'false');
  }
}

function checkBlockedRoutes() {
  for (const [route, relativePath] of blockedRoutePages) {
    const source = readRequired(relativePath);
    if (!source.includes('RouteBlockedState')) {
      fail(`${route} direct page must render RouteBlockedState`);
    }
    for (const pattern of blockedRouteForbiddenLiterals) {
      if (pattern.test(source)) {
        fail(`${relativePath} contains forbidden placeholder literal ${pattern}`);
      }
    }
  }
}

try {
  runExistingLiteralCheck();
  scanProductionUiSources();
  checkRouteVisibility();
  checkBlockedRoutes();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Production UI smoke check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Production UI smoke check passed.');
