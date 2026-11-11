# Client preferences checkpoint — 2026-11-11

These changes were already present in the working tree alongside Quote Builder. The user approved preserving them in a separate commit before branching for the next database work.

## Implemented behavior

Client preferences use a `ClientPreference` relation containing category, value and optional notes. Multiple preferences may share a category. Client create/edit forms use a shared preferences editor; profile rendering shows the saved entries. Quick creation supplies an empty list. Contracts validate category/value text and permit an explicit empty replacement; omitting preferences from a partial update preserves existing entries.

The client service includes preferences in reads, creates entries with a new client, replaces entries only when an update explicitly supplies them, and transfers entries during a client merge. Demo seed mapping creates relation entries from the existing sample preference values. These changes do not affect Quote Builder inputs, calculations or persistence.

## Migration boundary

`202611080001_client_preferences` creates the relation and its client/category index, copies nonblank values from the eight former preference columns, and merges `importantNotes` into `generalNotes` while avoiding an identical duplicate. It then drops the migrated preference columns and `importantNotes`.

This migration changes the storage/API contract and must travel with its matching application code. It is included in this source checkpoint, not applied to the running application database by the commit/push task. All migrations applied successfully in the disposable PostgreSQL Builder stack; that empty-database run does not establish populated-production-data migration parity. Review/back up the target database and verify representative existing preference/note data as part of the next database rollout.

## Verification and follow-up

The combined working tree passed the contract/calculator suite (70), web suite (57), API suite (173 passed; 23 database-gated skips), isolated Builder PostgreSQL suite (27), API compilation/type checks and Next.js production build. Preference contract tests cover repeated categories, normalization, empty replacement, omitted partial-update preservation and invalid text.

The historical 0.1.2 release migration manifest remains out of sync with the three new migration directories in this branch. Release packaging for the next version is still required. Full populated-data migration verification and interactive preferences-editor QA were not added by this checkpoint task.
