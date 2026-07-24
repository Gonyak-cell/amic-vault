# Presidio measured activation decision

## Decision

`DEFERRED_BY_PROFILE`

AMIC Vault does not add a Presidio dependency, image, service, adapter, model,
configuration, or runtime authority in `PACK-SF20-05`. Presidio 2.2.364 is
retained only as an exact L0 `NO_COPY` source-and-test reference. The current
35-case Korean synthetic DLP corpus passes every activation threshold, so an
additional Python DLP service has no measured benefit for the maximum-20-user
profile.

A threshold miss changes the recorded outcome to
`FOLLOW_ON_PACK_REQUIRED`. It does not authorize runtime activation. A new
PACK, dependency decision, threat model, resource measurement, shadow
evaluation, and rollback proof would still be required.

## Non-delegable Vault authority

Presidio may never become authoritative for any of the following:

- Matter permission, tenant isolation, or ethical-wall decisions;
- audit completion, immutable-original handling, or document state;
- egress eligibility, manual-review approval, or delivery;
- scan coverage, `UNSCANNABLE` handling, exception expiry, or fail-closed
  behavior.

A detector result can be one bounded input to a later Vault-owned policy. It
cannot turn a deny into an allow, suppress an audit event, or bypass exact
version assessment.

## Exact upstream reference

| Field | Pinned value |
|---|---|
| Official repository | `https://github.com/microsoft/presidio` |
| Release | `2.2.364` |
| Commit | `779dbd286d5ef4d1fbe2514275fb1bce358f2417` |
| Tree | `faa34e3cfd7b00ab1e99b570ac16333488b4f9a8` |
| License path | `LICENSE` |
| License SHA-256 | `f3e86ee59a49bcfb0d9a9547484d55224ea7b2d04f95b1947b4d18d17f6de535` |
| Source-lab clone path | `clones/presidio` |
| Product-tree policy | L0 `NO_COPY` |

The clone belongs under `${OSS_RESEARCH_ROOT}`. That research root must be
disjoint from the AMIC Vault worktree, have the official remote, be detached
at the exact commit, have the exact tree and license hash, and remain clean.
The source lab is not a build context or runtime input.

## Korean source/test references

| Reference | Upstream path | Git blob |
|---|---|---|
| Resident-registration recognizer | `presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_rrn_recognizer.py` | `77ebab08d16bd6314a72cc49caeb88eb492c70f5` |
| Resident-registration tests | `presidio-analyzer/tests/test_kr_rrn_recognizer.py` | `3a1719e0793275553fd2e84fd4c34041af92d423` |
| Passport recognizer | `presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_passport_recognizer.py` | `93606722c83465c09120069aa1d6b0d7ec09d199` |
| Passport tests | `presidio-analyzer/tests/test_kr_passport_recognizer.py` | `b6d7d93f35a9334dd5d9cb621e58c6e9c8056e27` |

These files are inspected only to understand recognizer shape, checksum
behavior, and boundary cases. No upstream source, test, fixture, generated
case, model, or expected-value text is copied into the product. Vault's
synthetic corpus and tests are independently authored and remain
Vault-owned.

## Reproducibility result

The bounded upstream command is:

```text
python3 -m pytest presidio-analyzer/tests/test_kr_rrn_recognizer.py presidio-analyzer/tests/test_kr_passport_recognizer.py
```

The recorded source-lab baseline is `TEST_FAILURE`, exit code `1`, without a
timeout. Its stdout is empty and both streams are represented only by
SHA-256 and byte-count metadata in `security/oss-source-map.yml`. The local
system Python used for the harvest is 3.9.6 and does not provide `pytest`;
the pinned analyzer declares Python 3.10 or newer and brings a separate
Python dependency and model patch surface. No dependency was installed only
to turn source harvesting into a runtime adoption.

This environment result does not weaken provenance. The validators
independently verify the official remote, commit, tree, license, clone
boundary, clean state, and all four Git blobs. A future baseline replay must
use a fresh source-lab clone and reproduce the recorded result or explicitly
replace it in a separately reviewed pin update.

## Measured Vault baseline

The authority record is
`security/dlp-korean-pii-baseline.json`:

- schema `amic-vault.dlp-korean-pii-baseline.v1`;
- policy `sf20-dlp-v1`;
- corpus hash
  `0159a3beff0aab7165a523137bd0708482ca162af996435872fc5f1a8ab31f48`;
- 35 synthetic cases and seven required entity classes;
- aggregate `TP=22`, `FP=0`, `FN=0`, `TN=223`;
- micro precision, recall, and F1 are all `1.0`;
- every class recall is `1.0`.

Only aggregate counts and metrics are decision evidence. Fixture text,
matched values, and raw PII are excluded from evidence and logs.

## Deterministic activation trigger

| Gate | Follow-on trigger |
|---|---|
| Micro precision | below `0.98` |
| Micro recall | below `0.90` |
| Micro F1 | below `0.94` |
| Any required class recall | below `0.80` |
| Required entity class | separately approved class is absent from the detector |

All comparisons are strict “below” comparisons; equality passes. The
decision function is:

```text
if any metric gate misses or an approved required class is absent:
    FOLLOW_ON_PACK_REQUIRED
else:
    DEFERRED_BY_PROFILE
```

The source-map validator reads the baseline and decision together and permits
exactly one of those outcomes. It rejects mismatched thresholds, baseline
identity, outcome, follow-on flag, pin, blobs, clone path, license hash, or
`NO_COPY` policy. It also rejects an exact upstream source/test blob found in
the product tree.

## Objective adoption analysis

### Expected quality benefit

The expected micro-F1 improvement on the current corpus is `0`. A follow-on
PACK must name the missed entity class or failing metric, add independent
synthetic cases, and show a statistically and operationally meaningful gain
over the same Vault baseline. General feature breadth is not a substitute
for measured improvement.

### Resource and patch envelope

If a follow-on PACK is opened, the first shadow candidate must fit within
this planning envelope before any production proposal:

- one internal-only, non-authoritative analyzer process;
- no public listener or direct object-storage/database access;
- initial hard cap of one vCPU and 2 GiB memory, with actual idle, p95, peak,
  image-size, startup, and throughput measurements recorded;
- a supported Python runtime, immutable image digest, SBOM, vulnerability
  scan, and separately pinned model assets;
- bounded request size, timeout, concurrency, and no outbound network;
- monthly dependency/model vulnerability review and an emergency patch
  owner.

These are admission caps, not measured Presidio consumption claims. Failure
to fit the cap or to identify an operating owner rejects adoption.

Compared with the current in-process bounded detector, Presidio would add a
Python dependency graph, NLP/model assets, image rebuilds, CVE triage,
resource calibration, health/readiness behavior, failure-mode testing, and
another internal service to patch and observe.

### License obligations

The pinned source is MIT licensed. If a future approved distribution includes
Presidio software, the copyright and permission notice must accompany the
software or substantial portions, and the no-warranty terms must be
preserved. This decision copies and distributes no Presidio source, tests,
fixtures, models, or binaries, so it creates no product artifact in this
PACK. A future image/model selection requires its own complete license and
notice inventory.

### Data boundary

Current evaluation uses only the independently authored synthetic corpus.
No customer document, derivative, identifier, or matched value enters the
source lab or an external service.

A future shadow evaluation must remain inside the approved private boundary,
receive only a bounded post-permission/post-wall input, have no storage or
egress authority, emit only a bounded candidate classification, and avoid raw
text in logs, metrics, traces, or audit metadata. Customer-data replay would
require a separate approved protocol and is not implied by this decision.

### Shadow-evaluation plan

A follow-on PACK must:

1. pin every runtime image, Python dependency, and model asset;
2. add the named missing synthetic cases without copying upstream fixtures;
3. run the Vault detector and candidate in non-enforcing shadow mode over the
   exact same authorized input;
4. record only aggregate confusion counts, latency, resource, timeout, and
   failure metrics;
5. prove permission, ethical-wall, tenant, audit, immutable-original, and
   egress decisions are unchanged;
6. prove unavailable, slow, malformed, or ambiguous candidate output cannot
   create an allow;
7. obtain a separate adoption decision before any enforcing path exists.

### Rollback

There is no runtime rollback in this PACK because nothing is activated. The
reference can be retired by removing its decision/source-map rows in a
reviewed provenance update while leaving Vault behavior unchanged.

For a future shadow deployment, rollback means removing the optional shadow
call and service from the approved topology, revoking its workload identity,
and retaining Vault's existing detector and decisions. Rollback must require
no data migration and must not delete audit or corpus evidence.

### Maximum-20-user operating cost

At this profile, another always-on service creates a larger relative burden
than its current measured benefit: an extra image and runtime to patch,
monitor, back up configuration for, capacity-test, and include in incident
and recovery drills. The existing baseline has no false positives or false
negatives in the bounded required corpus, so that recurring burden is not
justified. A named quality failure or newly approved entity class is the only
valid reason to reopen the decision.

## Verification boundary

The current decision is complete only when:

- source-map, upstream-lock, upstream-baseline, and test-reuse validators pass
  against the exact source lab;
- the DLP corpus selects `DEFERRED_BY_PROFILE`;
- negative validator fixtures prove pin, blob, license, clone, outcome, and
  `NO_COPY` drift fail;
- the small-firm runtime-manifest scan finds no Presidio service, image,
  dependency, or model;
- dependency manifests, lockfiles, DLP runtime, and production topology have
  no change attributable to this decision.
