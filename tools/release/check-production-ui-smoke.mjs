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

const designSystemChecklistPatterns = [
  { name: 'screen inventory', pattern: /Login[\s\S]*AppShell[\s\S]*Dashboard[\s\S]*Matters[\s\S]*Search[\s\S]*Records[\s\S]*Audit[\s\S]*Admin/ },
  { name: 'token and raw hex rules', pattern: /shared CSS tokens[\s\S]*raw hex color literals/i },
  { name: 'component rules', pattern: /PageHeader[\s\S]*SectionCard[\s\S]*EmptyState[\s\S]*StatusBadge/ },
  { name: 'shadow and gradient rules', pattern: /custom shadows[\s\S]*custom gradient/i },
  { name: 'responsive viewports', pattern: /1440px[\s\S]*768px[\s\S]*375px/ },
  { name: 'fake data and reference safety', pattern: /fake\/mock\/sample\/demo[\s\S]*workspace ID[\s\S]*AI Prep/i },
];

const productionInventoryPatterns = [
  { name: 'status definitions', pattern: /visible[\s\S]*visible_admin_only[\s\S]*visible_limited[\s\S]*hidden_until_api_ready[\s\S]*hidden/ },
  { name: 'core visible routes', pattern: /\/dashboard[\s\S]*`visible`[\s\S]*\/matters[\s\S]*`visible`[\s\S]*\/search[\s\S]*`visible`/ },
  { name: 'admin and governance routes', pattern: /\/records[\s\S]*`visible_admin_only`[\s\S]*\/audit[\s\S]*`visible_admin_only`[\s\S]*\/walls[\s\S]*`visible_admin_only`[\s\S]*\/enterprise[\s\S]*`visible_admin_only`/ },
  { name: 'API-unready routes', pattern: /\/files[\s\S]*`hidden_until_api_ready`[\s\S]*\/integrations\/onedrive[\s\S]*`hidden_until_api_ready`/ },
  { name: 'AI Prep limited route', pattern: /\/ai-prep[\s\S]*`visible_limited`[\s\S]*File organization prep\/readiness only/i },
  { name: 'hidden route list', pattern: /\/launch[\s\S]*`hidden`[\s\S]*\/scale[\s\S]*`hidden`[\s\S]*\/contracts[\s\S]*`hidden`[\s\S]*\/dd[\s\S]*`hidden`[\s\S]*\/litigation[\s\S]*`hidden`/ },
  { name: 'route policy source link', pattern: /apps\/web\/src\/lib\/features\.ts[\s\S]*apps\/web\/src\/lib\/navigation\.ts/ },
  { name: 'production data invariants', pattern: /fake\/mock\/sample\/demo[\s\S]*workspace ID[\s\S]*tenant ID[\s\S]*raw UUID slices/i },
  { name: 'AI scope exclusion', pattern: /Legal analysis[\s\S]*summary[\s\S]*external model[\s\S]*raw prompt[\s\S]*model response/i },
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

function parseFeaturePolicyMap(featuresSource) {
  const map = new Map();
  const routeMatches = [...featuresSource.matchAll(/route: '([^']+)'/g)];
  for (const [index, match] of routeMatches.entries()) {
    const route = match[1];
    const routeStart = match.index ?? -1;
    const nextRouteStart = routeMatches[index + 1]?.index ?? featuresSource.length;
    const block = featuresSource.slice(routeStart, nextRouteStart);
    const production = block.match(/production: '([^']+)'/)?.[1];
    const navigation = block.match(/showInNavigation: (true|false)/)?.[1];
    if (route && production && navigation) {
      map.set(route, {
        production,
        showInNavigation: navigation === 'true',
      });
    }
  }
  return map;
}

function parseInventoryPolicyMap(inventorySource) {
  const map = new Map();
  const rowPattern = /^\|\s*`(\/[^`]+)`\s*\|[^|]*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/gm;
  for (const match of inventorySource.matchAll(rowPattern)) {
    const route = match[1];
    const production = match[2];
    const navigationCell = match[3].trim();
    map.set(route, {
      production,
      showInNavigation: navigationCell.startsWith('Shown'),
    });
  }
  return map;
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

function checkDesignSystemChecklist() {
  const source = readRequired('docs/ui/design-system-checklist.md');
  for (const { name, pattern } of designSystemChecklistPatterns) {
    if (!pattern.test(source)) {
      fail(`Design system checklist missing ${name}`);
    }
  }
}

function checkProductionUiInventory() {
  const source = readRequired('docs/ui/production-ui-inventory.md');
  const featuresSource = readRequired('apps/web/src/lib/features.ts');
  const featurePolicies = parseFeaturePolicyMap(featuresSource);
  const inventoryPolicies = parseInventoryPolicyMap(source);
  for (const { name, pattern } of productionInventoryPatterns) {
    if (!pattern.test(source)) {
      fail(`Production UI inventory missing ${name}`);
    }
  }
  for (const [route, policy] of featurePolicies) {
    const inventory = inventoryPolicies.get(route);
    if (!inventory) {
      fail(`Production UI inventory missing route from features.ts: ${route}`);
      continue;
    }
    if (inventory.production !== policy.production) {
      fail(
        `Production UI inventory status mismatch for ${route}: inventory ${inventory.production}, features.ts ${policy.production}`,
      );
    }
    if (inventory.showInNavigation !== policy.showInNavigation) {
      fail(
        `Production UI inventory navigation mismatch for ${route}: inventory ${inventory.showInNavigation}, features.ts ${policy.showInNavigation}`,
      );
    }
  }
}

try {
  runExistingLiteralCheck();
  scanProductionUiSources();
  checkRouteVisibility();
  checkBlockedRoutes();
  checkDesignSystemChecklist();
  checkProductionUiInventory();
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
