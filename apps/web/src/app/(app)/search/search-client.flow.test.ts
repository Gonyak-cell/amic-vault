import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SearchClient workbench flow', () => {
  const source = readFileSync(new URL('./search-client.tsx', import.meta.url), 'utf8');

  it('stores only an opaque selected-result key in browser history', () => {
    expect(source).toContain("const searchSelectionStateKey = 'amicVaultSearchSelection'");
    expect(source).toContain('window.history.replaceState(nextState');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('document.body.innerText');
  });

  it('keeps row selection local and leaves preview behind an explicit action', () => {
    const selectResultBody = source.match(
      /function selectResult\(result: SearchResultDto\) \{([\s\S]*?)\n {2}\}/,
    )?.[1];
    expect(selectResultBody).toContain('setSelectedResultKey');
    expect(selectResultBody).toContain('rememberSearchSelection');
    expect(selectResultBody).not.toContain('searchDocuments');
    expect(selectResultBody).not.toContain('PreviewSessionFrame');
    expect(source).toContain('onPreview={setPreviewResult}');
  });
});
