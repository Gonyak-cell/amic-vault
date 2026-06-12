# Live Backlog Extensions

`docs/package/` is the frozen package source and remains read-only. Future-release
TUW detail that must be created after R3 Gate is kept here instead.

- `backlog_r4_r14.csv` is the live detailed backlog for the active R14 technical
  completion goal.
- `backlog_r4_r14.json` is the generated JSON companion required by
  `tools/backlog/validate.mjs`.
- `pnpm backlog:validate` validates both the frozen R0~R3 backlog and this live
  R4~R14 extension.

The release order is:

`R0 -> R1 -> R2 -> R3 -> DLP prelude -> R4 -> R5 -> R6 -> R7 -> R8 -> R9/R10 -> R11 -> R12 -> R13 -> R14`.
