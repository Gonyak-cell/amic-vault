# Search Privacy

AMIC Vault search treats query text as sensitive tenant data. Search routes and
audit events must support reusable workflows without leaking raw terms, snippets,
document body text, prompt text, or model responses.

## Tenant URL Policy

Tenant deployments choose one of two URL modes:

| Mode | Setting | Behavior |
|---|---|---|
| Plaintext reusable URL | `NEXT_PUBLIC_SEARCH_URL_PRIVACY_MODE=plaintext_url` | The search route may keep `q` and display-safe filters in `/search?...` so an authorized user can reuse the same URL. |
| Private saved reference | `NEXT_PUBLIC_SEARCH_URL_PRIVACY_MODE=private_saved_ref` | The search route strips raw `q` values from the browser URL. Reuse goes through `/search?searchRef=<saved_search_id>` after the user saves the search. |

`private_saved_ref` is the required mode for tenants that classify search terms
as confidential matter content. The web client still sends the query to the
search API for execution, but it does not persist raw terms in reusable URLs.

## Saved Searches

Saved searches persist the user's authorized query JSON in `saved_searches` for
that tenant and user. They remain scoped by `tenant_id` and `user_id`, and the
UI must not render raw `saved_search_id` values as labels. In private mode the
copy action creates only a saved-search reference URL and never prints the
reference in the page markup.

## Audit Contract

Search audit metadata is bounded to:

- `query_hash`
- `query_length`
- `filter_refs`
- `result_count`
- `duration_ms`
- `scope_type`

Saved-search audit metadata may also include `request_id` for the saved-search
reference. `filter_refs` can record stable filter presence or enum refs, such as
`matter_code_filter:present`, but must not contain raw query text, document
body, snippets, prompt text, model responses, private endpoint URLs, or customer
document content.

## Verification

PR-3A requires:

- `pnpm --filter @amic-vault/api test -- search privacy`
- `pnpm --filter @amic-vault/web test -- search-save-panel`
- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`

The production smoke guard checks the shared DTO, web client policy routing,
panel private-reference rendering, API bounded audit metadata, and this document
as a single release contract.
