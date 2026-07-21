# OSS-00 unsigned release-identity evidence

`verify-release-identity.mjs` emits a local, unsigned identity graph with one
source SHA/tree, API/web/ingestion immutable image IDs, their SBOM hashes, the
normalized scan-summary hash, and policy state. The generated receipt records
`EXTERNAL_BLOCKED_SIGNING_IDENTITY_REQUIRED`; it is not a signature, an
attestation, a registry write, or a release approval.

Cosign was researched only for format compatibility: official `v3.1.2` source
commit `193d2153431f8bb0d945a4c1ee721872f73add67`, tree
`6647db468973d11edb5e737293fcf4b05c69a84a`, Apache-2.0 license hash
`sha256:c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`.
No Cosign binary, private key, certificate, OIDC token, registry credential,
or signing command is used by this repository.
