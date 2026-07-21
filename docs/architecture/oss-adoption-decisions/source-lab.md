# Source-lab decision

The upstream source lab is research-only and must be supplied through the
external `OSS_RESEARCH_ROOT` environment variable. The path must be real,
non-symlinked, and disjoint from the AMIC Vault product repository; it is never
part of a Docker context or committed product tree.

Every candidate lock records the official remote, release, full commit/tree,
license path/hash, detached-clean state, owner, and either `PINNED` or an
explicit `BLOCKED` reason. No lock row authorizes copying, forking, shipping,
or adopting upstream code.
