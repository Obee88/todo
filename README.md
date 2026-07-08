# Todo

Multi-user todo list app: email/password auth, list CRUD, sortable checkable
items, list sharing. Built with Next.js 15 (App Router) + TypeScript +
Tailwind + Drizzle ORM + Postgres. Deployed as a single-container managed
project on `vps.codes.hr` (see `../vps/MANAGED_PROJECT_GUIDE.md`).

See `PLAN.md` in this folder for the full specification and task breakdown.

> Status: all five tasks are complete — project scaffold, authentication,
> list CRUD, list items (CRUD, checking, sorting), and list sharing
> (invite/remove contributors). `/` shows lists you own and lists shared
> with you; `/lists/[id]` shows a members panel and invite form for owners.

## Local development

Requires Node 22+ and a local Postgres instance.

```bash
npm install
cp .env.example .env   # then set DATABASE_URL and AUTH_SECRET
npm run db:migrate     # applies drizzle/*.sql in order (idempotent)
npm run dev            # http://localhost:3000
```

Required environment variables (see `.env.example`):

- `DATABASE_URL` — Postgres connection string. Auto-injected by the platform
  in production; set manually for local dev. No default is provided.
- `AUTH_SECRET` — secret used by next-auth to sign/encrypt JWTs. Generate one
  with `openssl rand -base64 32`. Required in every environment (dev, CI,
  and production); the app will fail to sign tokens without it.

`GET /healthz` returns `200 ok` once the server is up — used by the Docker
`HEALTHCHECK` and the platform's deploy gate. It is always public,
regardless of auth state.

## Authentication

Email/password auth via next-auth (Credentials provider) with JWT sessions
— no database sessions, no OAuth, no Auth.js adapter tables. See `PLAN.md`
Section 3 for the full interface spec.

- `POST /api/register` — body `{ email, password, name? }`. Creates a
  `user` row with a bcrypt-hashed password (email is lowercased before
  storage and lookup) and immediately signs the new user in. Returns `201
  { id }` on success, `409 { error }` if the email is already registered,
  `400 { error }` on invalid input (e.g. password under 8 characters).
- `/register` — a form that posts to `/api/register`; redirects to `/` on
  success and shows the server's error message on failure (e.g. "Email
  already registered").
- `/login` — a next-auth Credentials sign-in form (email + password);
  redirects to `/` on success, shows "Invalid email or password" on failure,
  and creates no session on failure.
- `/api/auth/*` — the standard next-auth route handler (session, csrf,
  signin, signout, callback endpoints). No custom logic lives here.

**Route protection:** `src/middleware.ts` + `src/auth.config.ts` redirect
any unauthenticated request to `/login`, except for `/login`, `/register`,
`/api/auth/*`, `/api/register`, and `/healthz`, which are always public.
Unauthenticated requests to other `/api/*` routes get a `401` instead of an
HTML redirect. This contract is already in place even though the only
protected page today is the `/` placeholder — Tasks 3–5 build the actual
protected content on top of it.

## List CRUD

Once signed in, `/` shows the current user's own lists ("Owned by you") and
any lists shared with them ("Shared with you", hidden entirely when empty),
plus a form to create a new list and a sign-out control.

- `POST /api/lists` — body `{ name }`. Creates a `list` row owned by the
  current session's user. Returns `201` with the created list on success,
  `400` on invalid/blank name, `401` if unauthenticated.
- `/lists/[id]` — list detail: shows the list name, (owner only) inline
  rename and delete controls, the sorted item list, and an add-item form
  (see "List items" below).
- `PATCH /api/lists/[id]` — body `{ name }`. Owner-only rename. Returns
  `200` with the updated list, `400` on invalid name, `401` if
  unauthenticated, `404` if the list doesn't exist **or** the caller isn't
  the owner (see access control below — the two cases are indistinguishable
  by design).
- `DELETE /api/lists/[id]` — owner-only delete; cascades to `list_item` and
  `list_member` rows via the `onDelete: "cascade"` foreign keys already
  declared in `schema.ts`. Returns `204` on success, `401` if
  unauthenticated, `404` under the same not-found-or-not-owner rule as
  `PATCH`.

**Access control (final model):** `src/lib/lists.ts` exports two distinct
checks, used deliberately by different routes:

- `getAccessibleList(userId, listId)` — **owner OR member**. Matches
  `list.owner_id = userId` OR a `list_member` row for `(listId, userId)`.
  Used by all item routes (`/api/lists/[id]/items*`) and the `/lists/[id]`
  page, since contributors can view/add/edit/check/delete items.
- `getOwnedList(userId, listId)` / `isListOwner(userId, listId)` —
  **owner-only**, queries `lists.owner_id` directly and is *not* satisfied
  by membership. Used by `PATCH`/`DELETE /api/lists/[id]` and both
  `/api/lists/[id]/members*` routes, since only the owner may
  rename/delete the list or manage sharing.

Both helpers return the list row (or `true`/`false` for `isListOwner`) on
success, or `undefined`/`false` for both "list does not exist" and "list
exists but this user lacks the required relationship" — callers always map
that to a `404` response (never `403`), per PLAN.md's explicit rule to avoid
leaking list existence to non-owners/non-members. See the `# DECISION`
comments in `src/lib/lists.ts` for why these two checks are implemented as
independent queries rather than one delegating to the other (a mere member
must pass the first and fail the second).

## List items

Once a user has access to a list — owner **or** contributor — they can add,
edit, check/uncheck, and delete its items.

- `POST /api/lists/[id]/items` — body `{ title }`. Appends a new item at the
  end of the undone group (`done: false`, `position = max(position for that
  list) + 1`). Returns `201` with the created item, `400` on a blank/missing
  title, `401` if unauthenticated, `404` if the list doesn't exist or the
  caller has no access.
- `PATCH /api/lists/[id]/items/[itemId]` — body `{ title?, done? }`; at least
  one field is required. Only the fields actually present in the body are
  written — `{ done: true }` alone never touches `title`, and vice versa.
  `position` is never part of this route's schema or update payload, so
  toggling `done` is structurally incapable of changing an item's position.
  Returns `200` with the updated item, `400` on invalid input (blank title,
  or neither field provided), `401` if unauthenticated, `404` if the list or
  item can't be accessed/found.
- `DELETE /api/lists/[id]/items/[itemId]` — deletes the item. Returns `204`
  on success, `401` if unauthenticated, `404` if the list or item can't be
  accessed/found.

**Sort rule** (PLAN.md Section 3): items are ordered `done ASC, position
ASC` — undone items first, each group in stable creation order. `position`
is assigned once, at creation, as `COALESCE(MAX(position) for that list,
-1) + 1` (so the first item in a list gets `position = 0`), computed as a
single SQL expression inside the `INSERT` (see `src/lib/items.ts`) rather
than a separate `SELECT MAX` followed by an `INSERT` from application code,
to avoid a read-then-write race on concurrent adds to the same list.
Checking/unchecking an item only ever updates its `done` column — `position`
is immutable after creation, which is what keeps creation order stable
within each group as items move between the undone/done groups.

`src/lib/items.ts` exposes `getSortedListItems(listId)` (the `ORDER BY`
query, used by `/lists/[id]` server-side) and `sortListItems(items)` (a pure
comparator implementing the same two-key rule, unit-tested independently of
any DB call) — both encode the identical rule so the sort has a test that
doesn't require a live database.

Access control for all three routes uses `getAccessibleList` from
`src/lib/lists.ts` (owner OR member) — see "List CRUD" above and "List
sharing" below.

## List sharing

The list owner can invite any existing registered user as a contributor,
and remove contributors. Contributors get full access to view/add/edit/
check/delete items, but cannot rename/delete the list or manage its
sharing — see "List CRUD" above for the two-tier access-control model
(`getAccessibleList` vs. `getOwnedList`/`isListOwner`).

- `POST /api/lists/[id]/members` — body `{ email }`. **Owner-only.** Looks
  up an existing user by (lowercased) email and adds a `list_member` row
  with `invitedBy` set to the current session's user. Returns:
  - `201` with `{ id, email }` on success.
  - `200` with `{ id, email, alreadyMember: true }` if the invitee is
    already a member — **treated as idempotent success, not a conflict**
    (the desired end state is already true; see the `# DECISION` comment in
    `route.ts` for the full rationale).
  - `400` if the owner tries to invite themselves (the owner already has
    full access and is never duplicated into `list_member`), or on
    malformed/missing email.
  - `404 { error: "No account exists for that email address." }` if no
    user is registered with that email — this is the literal acceptance
    criterion ("rejected with an error indicating no such account exists").
  - `404` if the caller isn't the owner (including a mere contributor) or
    the list doesn't exist — indistinguishable by design.
  - `401` if unauthenticated.
- `DELETE /api/lists/[id]/members/[userId]` — **Owner-only.** Removes the
  `list_member` row for `userId` on this list. Returns `204` on success,
  `404` if the caller isn't the owner, the list doesn't exist, or `userId`
  isn't actually a member; `401` if unauthenticated. There is no
  self-service "leave a shared list" action for members in v1 — PLAN.md
  doesn't specify one, so removal is exclusively an owner action.
- `/lists/[id]` renders a `MembersPanel` (current members + remove buttons +
  invite-by-email form) **only when the current user is the owner** — a
  contributor sees the items UI but no sharing controls, matching the
  hidden-not-403'd UX convention used by `ListControls`.
- `/` shows a "Shared with you" section (via `getMemberLists`) alongside
  "Owned by you" (via `getOwnedLists`) — a list can never appear in both,
  since the owner is never inserted into `list_member` for their own list.

## Database / migrations

Schema is defined in `src/lib/db/schema.ts` (Drizzle). Hand-authored SQL
migrations live in `drizzle/*.sql` and are applied in lexicographic order by
`scripts/migrate.mjs` — a plain Node ESM script with no build step, so it can
run inside the standalone Docker image before `next start`.

- `npm run db:generate` — diff `schema.ts` against `drizzle/` and emit a new
  migration file (via `drizzle-kit`). Review the generated SQL before
  committing; hand-edit if needed (e.g. to add `IF NOT EXISTS` guards).
- `npm run db:migrate` — apply pending migrations to `$DATABASE_URL`. Tracks
  applied files in a `__migrations` ledger table so re-running is a no-op.
  Every migration file must also be idempotent on its own (e.g.
  `CREATE TABLE IF NOT EXISTS`) as a second line of defense.

The migration runner does **not** seed any data (no default admin, no demo
content) — registration is self-service (`/register`, arriving in Task 2).

## Build

```bash
npm run build
```

Produces a standalone server bundle in `.next/standalone` (see
`next.config.ts`, `output: "standalone"`).

## Tests

```bash
npm test
```

Runs the Vitest suite: the `/healthz` route handler, a static idempotency
check on `drizzle/0000_init.sql`, password hashing/normalization, the
Credentials provider's `authorize()` matching logic, `/api/register`'s
validation/duplicate-detection/response-shape behavior, the list
access-check helpers (`src/lib/lists.ts` — `getAccessibleList`,
`isListOwner`, `getOwnedList`, `getOwnedLists`, `getMemberLists`), the
`/api/lists*` route handlers' authorization logic (owner-only enforcement,
404-not-403 semantics), the item sort rule and position-assignment logic
(`src/lib/items.ts` — both the pure `sortListItems` comparator and the
`getSortedListItems`/`insertListItem` query shapes), the
`/api/lists/[id]/items*` route handlers' partial-update and access-check
behavior, and the `/api/lists/[id]/members*` route handlers' owner-only
enforcement, no-such-account 404, self-invite rejection, and
duplicate-invite idempotency — all with the DB (and, where relevant,
`auth()`/`signIn()`) mocked.

**Regression coverage (Task 5):** every route/helper test file above
includes explicit "mere member" cases proving access did not loosen or
tighten in the wrong direction: `getAccessibleList` now accepts a member,
`isListOwner`/`getOwnedList` still reject a member, `PATCH`/`DELETE
/api/lists/[id]` and both `/api/lists/[id]/members*` routes still 404 a
mere member, and `/api/lists/[id]/items*` routes now 2xx a mere member.
There is no live-Postgres integration test in this repo — DB-dependent
behavior is verified manually / in CI with a real Postgres, since this
sandbox has no `psql`/`docker` available.

## Docker

```bash
docker build -t todo .
docker run -e DATABASE_URL=postgres://... -p 3000:3000 todo
docker inspect --format='{{.State.Health.Status}}' <container> # expect: healthy
```

The container runs `scripts/migrate.mjs` before `next start` (see
`Dockerfile` CMD) — migrations always apply before the app starts serving
traffic. The image runs as a non-root user (`nextjs`, uid 1001) per the
platform's contract.

## Deployment

Deployment is handled by `.github/workflows/deploy.yml` on every push to
`main`: builds and pushes the image to GHCR, then notifies the
`vps.codes.hr` dashboard via a signed webhook. See
`../vps/MANAGED_PROJECT_GUIDE.md` for the full platform contract and
`PLAN.md` Section 6 for the one-time human setup steps (GitHub repo, dashboard
project registration, DNS, repo secrets) required before the first deploy.

## Project layout

```
src/app/                          Next.js App Router pages & routes
src/app/healthz/route.ts          GET /healthz — 200 OK, no DB check
src/app/login/page.tsx            /login — Credentials sign-in form
src/app/register/page.tsx         /register — registration form
src/app/api/auth/[...nextauth]/   next-auth route handler (/api/auth/*)
src/app/api/register/route.ts     POST /api/register
src/app/page.tsx                  / — signed-in user's owned lists + shared-with-you lists + create-list form + sign-out
src/app/_components/CreateListForm.tsx  Client form, POSTs to /api/lists
src/app/lists/[id]/page.tsx       /lists/[id] — list detail (name, owner-only rename/delete, sorted items, add-item form, owner-only members panel)
src/app/lists/[id]/_components/ListControls.tsx  Rename/delete UI, gated on isOwner
src/app/lists/[id]/_components/ItemList.tsx      Renders items in server-given (sorted) order; toggle/edit/delete
src/app/lists/[id]/_components/AddItemForm.tsx   Add-item form, POSTs to /api/lists/[id]/items
src/app/lists/[id]/_components/MembersPanel.tsx  Owner-only: member list + remove buttons + invite-by-email form
src/app/api/lists/route.ts        POST /api/lists
src/app/api/lists/[id]/route.ts   PATCH/DELETE /api/lists/[id] (owner-only)
src/app/api/lists/[id]/items/route.ts            POST /api/lists/[id]/items (owner OR member)
src/app/api/lists/[id]/items/[itemId]/route.ts   PATCH/DELETE /api/lists/[id]/items/[itemId] (owner OR member)
src/app/api/lists/[id]/members/route.ts          POST /api/lists/[id]/members (owner-only invite)
src/app/api/lists/[id]/members/[userId]/route.ts DELETE /api/lists/[id]/members/[userId] (owner-only remove)
src/auth.ts                       Full next-auth config (Credentials provider, JWT/session callbacks)
src/auth.config.ts                Edge-safe next-auth config (middleware gate, session strategy)
src/middleware.ts                 Route protection — redirects unauthenticated requests to /login
src/lib/auth/password.ts          bcrypt hashing + email normalization helpers
src/lib/auth/authorize.ts         Credentials-matching logic used by src/auth.ts's authorize()
src/lib/lists.ts                  List access-check helpers (getAccessibleList: owner OR member; isListOwner/getOwnedList: owner-only; getOwnedLists, getMemberLists, getListMembers)
src/lib/items.ts                  Item sort/position helpers (getSortedListItems, sortListItems, insertListItem)
src/lib/db/schema.ts              Drizzle schema (user, list, list_member, list_item)
src/lib/db/index.ts               Lazy Drizzle/postgres client
drizzle/                          Hand-authored idempotent SQL migrations
scripts/migrate.mjs               Runtime migration runner (invoked by Dockerfile CMD)
```
# todo
