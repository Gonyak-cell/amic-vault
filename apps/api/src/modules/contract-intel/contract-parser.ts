import { createHash } from 'node:crypto';
import type { ContractClauseKind, RedlineChangeType } from '@amic-vault/shared';

export const contractParserVersion = 'r8-local-v1';

export interface ParsedClause {
  clauseKind: ContractClauseKind;
  clauseNumber: string;
  startOffset: number;
  endOffset: number;
  headingHash: string;
  textHash: string;
}

export interface ParsedDefinedTerm {
  normalizedTermKey: string;
  termHash: string;
  definitionHash: string;
  startOffset: number;
  endOffset: number;
}

export interface ParsedRedlineChange {
  changeType: RedlineChangeType;
  startOffset: number;
  endOffset: number;
  textHash: string;
}

export interface ContractParseResult {
  status: 'success' | 'partial' | 'failed';
  clauses: ParsedClause[];
  definedTerms: ParsedDefinedTerm[];
  redlineChanges: ParsedRedlineChange[];
  warnings: string[];
}

const clauseLinePattern =
  /^(?<heading>\s*(Article|Section|Clause)\s+(?<number>[A-Za-z0-9_.-]+)\b[^\n]{0,160}|\s*제\s*(?<krNumber>\d+)\s*조\b[^\n]{0,160})/gim;

const definedTermPattern =
  /["“](?<term>[A-Za-z0-9][A-Za-z0-9 _./&()-]{1,78})["”]\s+(means|shall mean|has the meaning)\s+(?<definition>[^.\n]{3,320})/gim;

const redlinePatterns = [
  { changeType: 'added' as const, pattern: /\[\[ADD:(?<text>[\s\S]{1,2000}?)\]\]/gi },
  { changeType: 'deleted' as const, pattern: /\[\[DEL:(?<text>[\s\S]{1,2000}?)\]\]/gi },
  { changeType: 'added' as const, pattern: /<ins>(?<text>[\s\S]{1,2000}?)<\/ins>/gi },
  { changeType: 'deleted' as const, pattern: /<del>(?<text>[\s\S]{1,2000}?)<\/del>/gi },
];

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseContractText(text: string): ContractParseResult {
  if (text.trim().length === 0) {
    return {
      status: 'failed',
      clauses: [],
      definedTerms: [],
      redlineChanges: [],
      warnings: ['contract.parser:empty_text'],
    };
  }
  const clauses = parseClauses(text);
  const definedTerms = parseDefinedTerms(text);
  const redline = parseRedlineChanges(text);
  const warnings = [...redline.warnings];
  if (clauses.length === 0) warnings.push('contract.parser:no_clause_boundaries');
  return {
    status: redline.failed ? 'partial' : 'success',
    clauses,
    definedTerms,
    redlineChanges: redline.failed ? [] : redline.changes,
    warnings,
  };
}

function parseClauses(text: string): ParsedClause[] {
  const matches = [...text.matchAll(clauseLinePattern)];
  if (matches.length === 0) {
    return [
      {
        clauseKind: 'section',
        clauseNumber: 'whole-document',
        startOffset: 0,
        endOffset: text.length,
        headingHash: sha256Hex('whole-document'),
        textHash: sha256Hex(text),
      },
    ];
  }
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? text.length : text.length;
    const heading = String(match.groups?.heading ?? '').trim();
    const number = String(match.groups?.number ?? match.groups?.krNumber ?? index + 1);
    return {
      clauseKind: heading.toLowerCase().startsWith('article') || heading.startsWith('제')
        ? 'article'
        : 'section',
      clauseNumber: number.slice(0, 80),
      startOffset: start,
      endOffset: Math.max(start + 1, end),
      headingHash: sha256Hex(heading),
      textHash: sha256Hex(text.slice(start, end)),
    };
  });
}

function parseDefinedTerms(text: string): ParsedDefinedTerm[] {
  return [...text.matchAll(definedTermPattern)].map((match) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const term = String(match.groups?.term ?? '').trim();
    const definition = String(match.groups?.definition ?? '').trim();
    return {
      normalizedTermKey: normalizeTermKey(term),
      termHash: sha256Hex(term),
      definitionHash: sha256Hex(definition),
      startOffset: start,
      endOffset: end,
    };
  });
}

function parseRedlineChanges(text: string): {
  changes: ParsedRedlineChange[];
  failed: boolean;
  warnings: string[];
} {
  const malformed =
    /\[\[(ADD|DEL):/i.test(text) &&
    !/\[\[(ADD|DEL):[\s\S]{1,2000}?\]\]/i.test(text);
  if (malformed) {
    return { changes: [], failed: true, warnings: ['contract.redline:malformed_marker'] };
  }
  const changes: ParsedRedlineChange[] = [];
  for (const entry of redlinePatterns) {
    for (const match of text.matchAll(entry.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const body = String(match.groups?.text ?? '');
      changes.push({
        changeType: entry.changeType,
        startOffset: start,
        endOffset: end,
        textHash: sha256Hex(body),
      });
    }
  }
  changes.sort((a, b) => a.startOffset - b.startOffset);
  return { changes, failed: false, warnings: [] };
}

function normalizeTermKey(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9 _.-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
