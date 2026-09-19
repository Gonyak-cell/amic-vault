# Generic-copy pagination and paired browser acceptance

Follow-up to d02302e78859e02f3ad6d491f7cd60533cef8186. Snapshot listing uses scoped keyset cursors with exact timestamp and ID order. Actual PostgreSQL tests list106 snapshots as50/50/6 and cover concurrent insert, timestamp ties, source/actor mismatch, malformed and absent-anchor cursor rejection. Office listing is unchanged; no schema change.

22 service/controller tests passed in /tmp/web-preserve-t7-paired-final.log; its browser failure was a test proxy fault-injection issue. The final OS helper drops completed PUT responses at the server bridge, without Playwright route.fetch adding session cookies; retries do not forward the body twice. Targeted paired browser then passed1 with22 filtered tests. It uses actual OS HTTP cookie routes, companion HTTP guards/controllers and separate disposable PostgreSQL stores; synthetic local storage and scan verdicts remain explicit. Lost upload/commit response, relogin recovery, permission revocation and exactly one published document were verified. OS T7-paired-receipt.json contains independent exact bytes/hash readback.

Final API typecheck and changed-file ESLint passed. Provider rollout still requires all scan workers to run the retained-copy guard plus migration0216 before OS enablement. No deployment or live-provider claim.
