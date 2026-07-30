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

  it('exposes responsive drawer state and grouped search-surface semantics', () => {
    for (const id of [
      'search-workbench-rail',
      'search-workbench-inspector',
      'search-workbench-save',
    ]) {
      expect(source).toContain(`aria-controls="${id}"`);
      expect(source).toContain(`id="${id}"`);
    }
    expect(source).toContain('aria-expanded={railOpen}');
    expect(source).toContain('aria-expanded={inspectorOpen}');
    expect(source).toContain('aria-expanded={saveOpen}');
    expect(source).toContain('aria-label="검색 표면"');
    expect(source).toContain('role="group"');
  });

  it('keeps saved-search list, create, and run ownership on the canonical Search Workbench', () => {
    expect(source).toContain('listSavedSearches()');
    expect(source).toContain('setSavedSearches(sortSavedSearches(result.items))');
    expect(source).toContain('saveSavedSearch({');
    expect(source).toContain('recordSavedSearchOpen(savedSearch.savedSearchId)');
    expect(source).not.toContain('href="/search/folders"');
  });
});
