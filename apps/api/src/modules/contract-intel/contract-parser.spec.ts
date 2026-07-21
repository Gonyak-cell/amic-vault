import { describe, expect, it } from 'vitest';
import { parseContractText } from './contract-parser';

describe('contract parser', () => {
  it('extracts clause boundaries, defined terms, and redline refs', () => {
    const parsed = parseContractText(`Article 1 Definitions
"Confidential Information" means all non-public information

Section 2 Obligations
[[ADD:Use reasonable safeguards]] and <del>old rule</del>`);

    expect(parsed.status).toBe('success');
    expect(parsed.clauses.map((clause) => clause.clauseNumber)).toEqual(['1', '2']);
    expect(parsed.definedTerms[0]?.normalizedTermKey).toBe('confidential information');
    expect(parsed.redlineChanges.map((change) => change.changeType)).toEqual(['added', 'deleted']);
    expect(JSON.stringify(parsed)).not.toContain('Use reasonable safeguards');
  });

  it('keeps redline parsing empty on malformed markers', () => {
    const parsed = parseContractText('Article 1 Broken\n[[ADD:missing terminator');

    expect(parsed.status).toBe('partial');
    expect(parsed.redlineChanges).toEqual([]);
    expect(parsed.warnings).toContain('contract.redline:malformed_marker');
  });

  it('extracts Korean article, numeric, and letter clause headings', () => {
    const parsed = parseContractText(`제1조 목적
본문

1. 세부 항목
내용

가. 하위 항목
내용`);

    expect(parsed.clauses.map((clause) => [clause.clauseKind, clause.clauseNumber])).toEqual([
      ['article', '1'],
      ['section', '1'],
      ['paragraph', '가'],
    ]);
    expect(parsed.clauses[0]?.headingText).toBe('제1조 목적');
  });
});
