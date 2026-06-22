# amic-vault

AMIC Vault — 로펌용 Matter-centric Legal Data OS.

- **개발 규칙(필독)**: [AGENTS.md](AGENTS.md)
- **현재 코드 상태**: [docs/current-code-state.md](docs/current-code-state.md)
- **실행 패키지(normative, read-only)**: [docs/package/codex/](docs/package/codex/README.md) — Master Brief, TUW 백로그, 실행 PACK, Constitution
- **원천 사양(참조, read-only)**: [docs/package/](docs/package/) — 충돌 시 codex 패키지가 우선
- **최신 launch closeout 경계**: [docs/release/launch-closeout-execution-a2d3bb9.md](docs/release/launch-closeout-execution-a2d3bb9.md)

## Current Verification Entry Points

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate
pnpm db:seed
pnpm test:integration
```

Release and product-surface gates are script-backed:

```bash
pnpm docs:frozen
pnpm launch:readiness
pnpm launch:execution
pnpm ui:production-smoke
pnpm release:dms-smoke -- --check-env
pnpm desktop:release-gate
```

External runtime evidence is still required before treating latest-main DMS GA
or native desktop distribution as approved for production.
