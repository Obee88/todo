# Verification Summary — Todo App

**Verified by:** Test & Verification Engineer agent (independent of implementation, per `davor-software-factory` doctrine — "agents do not approve their own work")
**Date:** 2026-07-08
**Revision verified:** no git repository present in `todo/`; source-tree content hash (sha256 of concatenated `src/**/*.{ts,tsx}` + `scripts/**/*.sql`, sorted by path): `6f15c779b012aa22631c7eb6edcc6d68d801ae162e2b3d4f771517c7ca9d13ba`
**Workflow followed:** `davor-software-factory/workflows/verify.md`

## Environment note

This sandbox has no `docker`/`psql` binary and no live Postgres or container runtime. Per the task brief, any criterion genuinely requiring a live DB/container is marked as a sandbox-unverifiable GAP, not a pass.

The sandbox mount also exhibits a known FUSE quirk: `npm install`/`next build` throw `EPERM` on temp-file cleanup when run directly on the mounted path. Per prior agents' documented workaround, the tree was diff-copied (`rsync`, excluding `node_modules`/`.next`) to `/tmp/todo-verify` and all commands below were run from there for a clean result. This is a sandbox artifact, not a code defect.

## Test suite run (raw results)

Command: `npx vitest run` (run 3 times from a clean `/tmp/todo-verify` checkout to check for flakiness)

```
Test Files  13 passed (13)
     Tests  103 passed (103)
  Duration  ~2.0s each run
```

All 3 runs: **103/103 passed, 0 failed, 0 flaky.**

Test files: `scripts/migrate.sql.test.ts`, `src/app/api/lists/route.test.ts`, `src/app/api/lists/[id]/route.test.ts`, `src/app/api/lists/[id]/members/route.test.ts`, `src/app/api/lists/[id]/members/[userId]/route.test.ts`, `src/app/api/lists/[id]/items/route.test.ts`, `src/app/api/lists/[id]/items/[itemId]/route.test.ts`, `src/app/api/register/route.test.ts`, `src/app/healthz/route.test.ts`, `src/lib/items.test.ts`, `src/lib/auth/authorize.test.ts`, `src/lib/auth/password.test.ts`, `src/lib/lists.test.ts`.

`npx tsc --noEmit`: exit 0, no output (clean).

`npm run build` (`next build`): exit 0. `⚠ Found lockfile missing swc dependencies, patching...` / `getaddrinfo EAI_AGAIN registry.npmjs.org` warnings appear (sandbox has no internet access to npmjs.org for an optional patch check) but are non-fatal — build proceeds and completes: "Compiled successfully in 6.6s", all 14 routes generated (`/`, `/login`, `/register`, `/lists/[id]`, `/healthz`, `/api/auth/[...nextauth]`, `/api/register`, `/api/lists`, `/api/lists/[id]`, `/api/lists/[id]/items`, `/api/lists/[id]/items/[itemId]`, `/api/lists/[id]/members`, `/api/lists/[id]/members/[userId]`, `/_not-found`).

No corrections were required — no test failures, no tsc errors, no build errors were found on this run.

## 12 acceptance criteria (PLAN.md Section 3)

| # | Criterion | Covering test(s) | Result |
|---|---|---|---|
| 1 | Given no account exists for email, valid registration creates a `user` row with a bcrypt hash and signs the user in | `src/app/api/register/route.test.ts`: "given no existing account, when valid registration data is submitted, then it creates the user and signs in, returning 201"; "given valid registration data, when the user row is inserted, then the stored password is a bcrypt hash, not the plaintext" | PASS |
| 2 | Given an account already exists for email, registration is rejected with a clear error and no duplicate row | `src/app/api/register/route.test.ts`: "given an account already exists for the email, when registration is submitted, then it returns 409 and does not insert a row"; "given an email that differs only in case ... still treated as a duplicate"; "given the DB insert races and hits a unique violation ... still returns 409" | PASS |
| 3 | Given a registered user, correct credentials to `/login` yield a valid session and redirect to `/`; incorrect credentials show an error and create no session | `src/lib/auth/authorize.test.ts`: "given valid credentials for an existing user, when authorized, then it returns the user object"; "given a known email with the wrong password, when authorized, then it returns null"; "given an unknown email, when authorized, then it returns null" | PASS |
| 4 | Given an authenticated user, creating a list with a name makes it appear on `/` with them as owner | `src/app/api/lists/route.test.ts`: "given an authenticated user, when they create a list with a name, then it is created with them as owner" | PASS |
| 5 | Given a list owner, rename/delete persists immediately; a non-owner attempting the same is rejected | `src/app/api/lists/[id]/route.test.ts`: "given the list owner, when renaming, then it updates and returns the list"; "given a non-owner, when attempting to rename, then it returns 404 and does not update"; "given the list owner, when deleting, then it deletes and returns 204"; "given a non-owner, when attempting to delete, then it returns 404 and does not delete"; plus explicit member-regression guards (see Regression section) | PASS |
| 6 | Given a list the user can access, adding an item appends it to the undone group at the end of creation order | `src/lib/items.test.ts`: "given a list with existing items, when a new item is added, then it is inserted with done=false via a single insert call"; "... position field must be a SQL fragment ... proof this isn't a read-then-write two-step"; `src/app/api/lists/[id]/items/route.test.ts` (POST tests, access-checked) | PASS |
| 7 | Given a mix of done/undone items, undone appear before done, each group in stable creation order | `src/lib/items.test.ts`: "given a mixed list of done/undone items, when sorted, then undone items come first, each group in position order" (asserts exact PLAN.md example A,B,C → A,C,B); "given items already in creation order within mixed done states ... each group preserves stable creation order"; "given all items are undone, when sorted, then order is by position only" | PASS |
| 8 | Given an item in an accessible list, toggling done changes only `done` (position/order preserved), item moves to correct group on next render | `src/app/api/lists/[id]/items/[itemId]/route.test.ts`: "given access to the list, when toggling done only, then it writes only done (+ updatedAt), never title or position" (asserts `body.position` unchanged and `captured` excludes `title`/`position`) | PASS |
| 9 | Given a list owner, inviting an existing registered user grants contributor access (visible on their `/`, can view/add/edit/check/delete) but not rename/delete/manage-sharing | `src/app/api/lists/[id]/members/route.test.ts`: "given the owner invites an existing user by email, when posting, then it inserts a list_member row and returns 201"; `src/lib/lists.test.ts`: "given a user is a member of one or more lists, when fetched, then those lists are returned" (getMemberLists, feeds `/`); `src/app/api/lists/[id]/items/[itemId]/route.test.ts`: "given a mere member ... has access via getAccessibleList, when toggling done, then it updates" and the DELETE equivalent; negative side covered by Task 3/5 regression guards below | PASS |
| 10 | Given a list owner invites an email with no matching account, request is rejected with an error indicating no such account exists | `src/app/api/lists/[id]/members/route.test.ts`: "given no account exists for the invited email, when posting, then it returns 404 with a clear message and does not insert" (asserts `body.error` matches `/no account exists/i`) | PASS |
| 11 | Given a user with no ownership/membership relationship to a list, requesting that list's page or API routes returns 404 | `src/app/api/lists/[id]/route.test.ts` (PATCH/DELETE non-owner → 404); `src/app/api/lists/[id]/items/[itemId]/route.test.ts` (PATCH/DELETE non-access → 404); `src/app/api/lists/[id]/members/route.test.ts` (POST non-owner → 404); `src/app/api/lists/[id]/members/[userId]/route.test.ts` (non-owner → 404, read below); `src/lib/lists.test.ts`: "given the list exists but the user is neither owner nor member ... returns undefined" (feeds every route's 404 branch) — no live-request/page-level (Next.js routing) integration test exists, but every underlying API route and access-check helper is covered | PASS (route/helper level); no full HTTP/page-render integration test — see Gaps |
| 12 | Given the built Docker image run with a valid `DATABASE_URL` and port mapping, `GET /healthz` returns 200 within `--start-period` and `docker inspect` reports `healthy` | `src/app/healthz/route.test.ts` covers only the route handler in isolation (returns 200) — no Docker/container runtime available in this sandbox | GAP — sandbox-unverifiable, requires live Docker/Postgres |

## Gaps

1. **Criterion 12 (Docker healthcheck end-to-end)** — sandbox-unverifiable, requires live Docker/Postgres. No `docker` binary exists in this environment; `docker build`, `docker run`, and `docker inspect --format='{{.State.Health.Status}}'` cannot be executed. `src/app/healthz/route.test.ts` verifies the route handler returns 200 in isolation, but the full container-boot-to-healthy path (Dockerfile build, `HEALTHCHECK` directive, `--start-period`, actual DB connectivity via `DATABASE_URL`) is unverified here. This is an expected sandbox limitation, not a known implementation defect — the Dockerfile and `/healthz` route were read and appear structurally consistent with `vps/MANAGED_PROJECT_GUIDE.md`, but this is not a substitute for an executed test.
2. **Criterion 11, page/route-level integration** — the underlying access-check helpers (`getAccessibleList`, `getOwnedList`, `isListOwner`) and every API route's non-access branch are unit/route-tested and consistently return 404, but there is no full Next.js integration/e2e test that actually renders `/lists/[id]` as a stranger and observes an HTTP 404 end-to-end (would require a live Postgres to seed cross-user fixtures). Treated as a partial gap layered on top of a PASS at the unit/route level.
3. **Task 1 acceptance criteria** (`npm run build` completes; `scripts/migrate.mjs` applies `0000_init.sql` idempotently against a real Postgres; `docker inspect` reports `healthy`) — the build criterion is verified (PASS, see above). The migration-idempotency-against-real-Postgres and docker-healthy criteria are sandbox-unverifiable, requires live Postgres/Docker. `scripts/migrate.sql.test.ts` (4 tests, passing) checks the SQL file's structure/idempotency markers (e.g., `IF NOT EXISTS`) statically, not an actual re-run against a live DB.

## Regression sanity check (highest-risk points)

- **Task 3 owner-only guarantee** (a mere list member cannot rename/delete a list): confirmed via `src/app/api/lists/[id]/route.test.ts` tests "given a mere member (not owner), when attempting to rename, then it returns 404 and does not update" and "given a mere member (not owner), when attempting to delete, then it returns 404 and does not delete" — both pass. Backed by `src/lib/lists.test.ts` "given the user is only a member (not owner), when fetched, then it returns undefined" (`getOwnedList`) and "given the user is only a member (not owner) of the list, when checked, then it returns false" (`isListOwner`).
- **Task 5 access-control guarantee** (non-owner/non-member gets 404 everywhere): confirmed across all mutating routes — `lists/[id]/route.test.ts` (rename/delete), `lists/[id]/items/[itemId]/route.test.ts` (patch/delete item), `lists/[id]/members/route.test.ts` ("given a non-owner, when posting an invite, then it returns 404" and "given a mere member (not owner), when posting an invite, then it returns 404"). Underlying helper `getAccessibleList` in `src/lib/lists.test.ts` confirms "given the list exists but the user is neither owner nor member ... returns undefined." All cited tests pass.

Both regression points have named, passing tests as of this run; no weakening or scope drift observed relative to `agents-logs.txt`'s account of Tasks 3 and 5.

## Overall Acceptance status: **PASS** (with documented sandbox gaps)

11 of 12 criteria fully pass with real covering tests observed passing in this run (103/103, 3 consecutive clean runs, tsc clean, build clean). Criterion 12 (Docker healthcheck) and part of Criterion 11 (full page-level integration) are explicit, expected sandbox gaps — not implementation defects — requiring live Postgres/Docker/browser rendering to close. No corrections to the implementation were needed; no failures were found to fix.
