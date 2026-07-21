# Upstream baseline records

These records are research evidence only.  Each command is the upstream
project's normal test or configuration command, run directly as an argument
array against its detached, clean source-lab clone.  The runner provides no
credentials or customer data, retains no raw output in the product tree, and
records only redacted output hashes in `security/oss-source-map.yml`.

| Component | Command | Result | Constraint |
| --- | --- | --- | --- |
| Paperless-ngx | `pytest` | `ENVIRONMENT_BLOCKED` | `pytest` is unavailable. |
| Mayan EDMS | `make test` | `TEST_FAILURE` | the unconfigured local test environment exits nonzero; no source mutation was observed. |
| Alfresco Community Repo | `mvn test` | `ENVIRONMENT_BLOCKED` | Maven is unavailable. |
| Docspell | `sbt test` | `ENVIRONMENT_BLOCKED` | sbt is unavailable. |
| Teedy | `mvn test` | `ENVIRONMENT_BLOCKED` | Maven is unavailable. |
| ClamAV | `cmake -S . -B build` | `ENVIRONMENT_BLOCKED` | CMake is unavailable. |
| Gotenberg | `make test-unit` | `TEST_FAILURE` | the unconfigured local test environment exits nonzero; no source mutation was observed. |
| tusd | `go test ./...` | `ENVIRONMENT_BLOCKED` | Go is unavailable. |

`TEST_FAILURE` is a faithful process result, not a claim that upstream itself
is defective. It is not eligible to be converted into a pass by changing an
upstream test, providing a credential, or weakening a command. All eight
clones were re-validated as exact, clean detached pins after this run.
