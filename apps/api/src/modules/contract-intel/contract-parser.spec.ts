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
});
