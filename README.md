# amic-vault

AMIC Vault — 로펌용 Matter-centric Legal Data OS.

- **개발 규칙(필독)**: [AGENTS.md](AGENTS.md)
- **실행 패키지(normative)**: [docs/package/codex/](docs/package/codex/README.md) — Master Brief, TUW 백로그 174건, 실행 PACK 25개
- **원천 사양(참조)**: [docs/package/](docs/package/) — 충돌 시 codex 패키지가 우선
- 착수: docs/package/codex/60_Execution_Packs.md 의 PACK-R0-01부터

## R0 Bootstrap

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv
```

`db:migrate`, `db:rollback`, `db:seed`, and `test:integration` are placeholders until their
own R0 PACKs introduce the database runner and integration suites.
