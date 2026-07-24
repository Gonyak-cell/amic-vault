# Korean DLP synthetic corpus

`korean-pii-eval.json` contains templates and reserved token names only. The
runner expands those names through its closed `SYNTHETIC_VALUES` registry.
Every identity-like value is intentionally fictional, impossible/reserved, or
a payment-network/public documentation test value. `.test` is the only email
TLD.

Do not add copied customer, employee, matter, production-log, or public-person
data. A new token must be registered in the runner, remain deterministic, and
pass the no-literal/no-unknown-token corpus checks. Evidence may contain only
aggregate metrics, corpus hashes, and misclassified case-ID hashes.
