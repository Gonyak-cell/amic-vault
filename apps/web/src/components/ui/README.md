# UI Components

R0 uses shadcn/ui-style source components checked into the app. Add future UI
components through the shadcn CLI and review generated files before commit.

Production app screens should prefer these shared primitives over route-local
panel anatomy:

- `PageShell`, `PageHeader`, and `SectionCard` for app screen structure.
- `DataTable` for dense operational tables with accessible captions.
- `FilterBar` and `FilterField` for labeled search, audit, admin, and policy filters.
- `DetailInspector` for right-side detail panels that hide internal refs by default.
- `EmptyState` and `StatusBadge` for no-data, blocked, warning, and readiness states.
