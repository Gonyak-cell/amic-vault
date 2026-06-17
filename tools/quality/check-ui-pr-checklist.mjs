#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const requiredFiles = [
  '.github/pull_request_template.md',
  'docs/ui/pr-review-checklist.md',
  'docs/ui/design-system-checklist.md',
];

const requiredPatterns = [
  { label: 'fake data review', pattern: /fake\/mock\/sample\/demo/i },
  { label: 'API unavailable state review', pattern: /API-unavailable|API unavailable|API 미응답/i },
  { label: 'ID exposure review', pattern: /workspace ID.*tenant ID|tenant ID.*workspace ID/i },
  { label: 'profile name and email review', pattern: /display name and email|name and email|이름.*이메일/i },
  { label: 'role and feature gating review', pattern: /Role, feature, and route visibility gates|Role And Capability Gating/i },
  { label: 'fail-closed review', pattern: /fail-closed/i },
  { label: 'empty and error state review', pattern: /empty.*permission denied|Empty, Error, And Permission States/is },
  { label: 'AI Prep scope review', pattern: /file organization prep/i },
  { label: 'raw AI data exclusion review', pattern: /raw prompt.*model response|raw prompt, raw source.*model response/is },
  { label: 'design-system review', pattern: /SaaS design tokens|SaaS Design System/i },
  { label: 'design-system checklist review', pattern: /docs\/ui\/design-system-checklist\.md/ },
  { label: 'visual drift review', pattern: /raw hex.*custom shadow.*custom gradient|custom shadow.*custom gradient/is },
  { label: 'shared component review', pattern: /PageHeader.*SectionCard.*EmptyState.*StatusBadge|StatusBadge.*table\/list\/filter/is },
  { label: 'i18n review', pattern: /i18n|ko\/en/i },
  { label: 'responsive review', pattern: /375px.*768px.*1440px|1440px.*768px.*375px/is },
  { label: 'accessibility review', pattern: /keyboard focus|accessible names|aria-current/i },
  { label: 'literal guard command', pattern: /pnpm check:production-ui-literals/ },
  { label: 'checklist guard command', pattern: /pnpm check:ui-pr-checklist/ },
  { label: 'production smoke gate', pattern: /Production UI smoke gate|production UI smoke gate/i },
  { label: 'evidence redaction review', pattern: /no secrets.*customer file contents|Evidence uses refs only/is },
];

const issues = [];
const fileTexts = [];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    issues.push(`Missing required file: ${relativePath}`);
    continue;
  }
  const text = readFileSync(absolutePath, 'utf8');
  fileTexts.push({ relativePath, text });
}

const combinedText = fileTexts.map(({ text }) => text).join('\n\n');

for (const { label, pattern } of requiredPatterns) {
  if (!pattern.test(combinedText)) {
    issues.push(`Missing required checklist coverage: ${label}`);
  }
}

for (const { relativePath, text } of fileTexts) {
  const trailingWhitespaceLines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /[ \t]+$/.test(line));

  for (const { lineNumber } of trailingWhitespaceLines) {
    issues.push(`${relativePath}:${lineNumber} has trailing whitespace`);
  }
}

if (issues.length > 0) {
  console.error('UI PR checklist guard failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('UI PR checklist guard passed.');
