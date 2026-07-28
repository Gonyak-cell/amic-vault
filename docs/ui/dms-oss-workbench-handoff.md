# DMS OSS Workbench Handoff

> Applies to `PACK-DMS-WB-01`, `PACK-DMS-WB-02`, and `PACK-DMS-WB-04`.
> Source pattern: current AMIC Vault components plus the linked Lazyweb DMS report. This is a behavior specification, not a visual copy of another product.

## Layout

| viewport | rail | list | inspector |
|---|---|---|---|
| `>=1280px` | visible, `232px` | `minmax(520px, 1fr)` | visible, `360px` |
| `768px~1279px` | toggle drawer | primary surface | toggle drawer |
| `<768px` | modal/drawer | primary surface | modal/drawer |

- Use existing surface, border, spacing, typography, focus and status tokens.
- Panes are separated by borders, not nested marketing-style cards.
- Do not add gradient, glow, decorative icon-only controls, auto-running motion, synthetic metric rows, or generic product promises.
- Use Korean task labels such as `문서 열기`, `업로드`, `검색 조건`, `세부 정보`; do not use abstract capability copy.

## `/files` interaction contract

| element | default | action | failure/empty |
|---|---|---|---|
| rail | all documents plus authorized navigation | select source/filter | no fake recent/folder item; show safe unavailable state |
| Matter folders | hidden without Matter context | load existing authorized folders after Matter select | folder fetch failure does not clear document list silently |
| list row | unselected | click, Enter, Space select | page/filter change clears stale selection |
| inspector | absent until row selected | show list DTO metadata and detail/preview action | permission/error clears prior row before safe state |
| preview | idle | explicit button only issues existing session | expire/error closes old source and announces failure |
| upload | closed | opens contextual panel with selected Matter | Matter absent means upload action is disabled with explanation |

## `/files` bulk-action contract

| element | default | action | failure/empty |
|---|---|---|---|
| selection | none | row checkbox or current-page checkbox selects only the loaded page | filter, page, Matter/folder context, or refresh clears stale selection |
| action bar | hidden | appears with an exact selected count; folder move is available only for one Matter | no “all search results” option or raw-ID input |
| confirmation | closed | names the bounded action and exact count; cancel/Escape restores focus | no mutation starts before explicit confirmation |
| progress | queued/running receipt | announces processed/total count without exposing policy details | navigation does not imply cancellation |
| result receipt | explicit success/failure counts | lists safe row labels and retries failed items only | deny/wall details collapse to safe copy; successes are never hidden |

## `/search` interaction contract

| element | default | action | failure/empty |
|---|---|---|---|
| global query | AppShell submits to `/search` | `/search` owns query/filter/result state | empty query stays on safe search state |
| advanced filters | collapsed when no active filter | open/close without losing URL state | malformed URL value is dropped before request |
| saved search rail | authorized folders/scopes only | apply existing saved query | revoked item clears selection and shows safe state |
| result row | unselected | click, Enter, Space select | new query/page clears selection |
| hit preview | idle | explicit action preserves existing bounded anchor | invalid/missing anchor opens ordinary preview, never guessed highlight |

## Accessibility

1. Focus order is rail, query/filter, list, inspector.
2. Every selected row has `aria-selected`; selected styling is not color-only.
3. Drawer opens with focus trap, closes by Escape, and restores trigger focus.
4. Loading/error/selection changes have concise live-region copy where existing patterns provide one.
5. Long Korean Matter/document names truncate visually but retain an accessible full-name affordance.
6. `prefers-reduced-motion` disables nonessential transition effects.

## Non-goals

- No all-results selection, bulk delete/disposal, external share, Office write, permission change, or original overwrite.
- No automatic preview/download on selection or hover.
- No inline document editing, sharing, records disposal, or access escalation.
- No mobile document cache or OneDrive/Office affordance.
