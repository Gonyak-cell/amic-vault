# Storage rejection closes upload streams before temporary-file cleanup

Automatic CI at `6c0716f3b9b0602cd3a68dde86c075c479f1a21d` found a real failure
boundary after PostgreSQL discovery was corrected. All 224 API test files and
1,208 tests passed, but Vitest reported an unhandled `ENOENT` opening the temporary
`quarantine-promotion` file. The verify job therefore failed. Its log was read
from job `105971608534` in run `35470918862`; it was not manually rerun.

`DocumentUploadService.upload` and `addVersion` constructed a file read stream
inline. When storage rejected before consuming it, cleanup could unlink the file
before the deferred stream open completed. Both paths now retain the stream,
attach handled completion immediately, and destroy/wait for close before
unlinking the file. The original storage rejection still reaches the caller.
Permission checks, transactions and publication authority are unchanged.

Two regression cases independently check the original error identity, a closed
stream, removal of the owned temporary file, and zero document/file/version
writes. A focused run including the real paired OS-browser/companion scenario
passed **48/48 across three suites**, zero skipped, in 16.22 seconds; resource
guard exit 0 in 16.99 seconds. Full API TypeScript and changed-file ESLint also
passed. A read-only reviewer found no material issue in the cleanup diff.

The paired run traversed the OS cookie API, production HTTP provider, companion
guard/service, disposable PostgreSQL and synthetic storage/scan. It rechecked
retained recovery, permission rejection and one publication with the current
stream cleanup. This is local acceptance; no operational provider or deployment
was used. `T6-stream-cleanup-results.json` records source and log hashes plus
sanitized execution excerpts.

The first local regression run passed its stream/error assertions but failed the
new zero-version-write assertion because the fixture had not returned its
existing `addNextVersion` spy. Returning the spy corrected the test setup; the
48/48 run above supersedes it. No assertion was removed.
