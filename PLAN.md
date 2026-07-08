# Todo App — Plan

Produced via `davor-software-factory` [Plan workflow](../davor-software-factory/workflows/plan.md). Status: **implementation complete, verified** — all 5 tasks built and passed the Verify workflow (see [VERIFICATION.md](./VERIFICATION.md), 103/103 tests, PASS with documented sandbox gaps). Section 6's external setup steps (GitHub repo, dashboard project registration, DNS, secrets) remain outstanding human actions before the first production deploy.

Date: 2026-07-08 (planned) / 2026-07-08 (implemented)

---

## 1. Requirement

**Primary objective:** Build a multi-user todo list app (email/password auth, list CRUD, sortable checkable items, list sharing) and deploy it as a managed project on the `vps.codes.hr` platform.

**Explicit constraints:**
- Auth: email + password, with register and login flows.
- CRUD on lists.
- Each list has todo items; items can be checked as done; items are sorted with unchecked items first.
- Each list can be shared with other users; an invited user can see and contribute to the list.
- Implementation lives in the `todo/` folder (already exists, currently empty).
- Deployment target is the managed VPS described in `vps/`; must use the shared Postgres instance on that VPS (not a separate DB).

**Implicit constraints (assumed, confirmed via clarifying questions):**
- Single container serving both frontend and backend (per `vps/MANAGED_PROJECT_GUIDE.md`, this is the simpler of the two supported deployment shapes and avoids the "no inter-container networking between projects" pitfall entirely).
- The app must follow the platform's contract: single TCP port, `/healthz` returning 200, non-root Dockerfile user, `DATABASE_URL` read from env with no default.
- No client-side data persistence assumptions beyond what the platform provides (one Postgres DB per project, provisioned automatically).

**Resolved open questions** (via user clarification, 2026-07-08):

| Question | Decision |
|---|---|
| Tech stack | Reuse the dashboard's proven stack: Next.js 15 (App Router) + TypeScript + Tailwind + Drizzle ORM + next-auth (Credentials provider, JWT sessions) + bcrypt + `postgres` driver. |
| Sharing model | Single role: **contributor**. Anyone invited to a list can view and edit its items. Only the owner can rename/delete the list or manage sharing. |
| Domain / project slug | Domain `todo.codes.hr`, dashboard project slug `todo`. |
| Email verification | None for v1. Register creates an active account immediately (matches the dashboard's current approach; no SMTP dependency). |

---

## 2. Analysis

**Files/components affected:**
- `todo/` — entire app, greenfield (currently empty).
- `vps/` — read-only reference for deployment contract; no changes to this folder.
- New: `todo/.github/workflows/deploy.yml`, `todo/Dockerfile`.

**Dependencies:**
- *Internal:* none — greenfield project, no existing code to integrate with.
- *External libraries:* `next`, `react`, `react-dom`, `drizzle-orm`, `drizzle-kit`, `postgres`, `next-auth` (`5.0.0-beta.25`, matching dashboard), `bcryptjs`, `zod`, `tailwindcss`.
- *Platform dependencies (from `vps/MANAGED_PROJECT_GUIDE.md`):*
  - Shared Postgres 16 cluster — dedicated DB + role provisioned automatically when "Provision database" is toggled on in the dashboard; `DATABASE_URL` auto-injected.
  - GHCR image publish on push to `main`, triggering a signed webhook to the dashboard.
  - Caddy reverse proxy via container labels the dashboard writes (no Caddyfile needed).
  - `/healthz` endpoint feeding the Dockerfile `HEALTHCHECK`.

**Decisions required before spec:** all four resolved above via `AskUserQuestion`; none outstanding.

**Conflicts with existing architecture:** none — this is a new, independent project on the platform. It does not share a database, network, or container with the dashboard or any other managed project (platform explicitly disallows inter-project networking).

**Platform constraints that shape the spec:**
- One container, one port, one domain (`todo.codes.hr`).
- Migrations must run at container startup (platform does not run them) — mirror the dashboard's `scripts/migrate.mjs` pattern.
- `github.repository_owner` must be lowercased in the GH Actions workflow before use in image tags (documented pitfall).
- `HEALTHCHECK` must use `wget`/`sh -c`, not `bash`, and needs a `--start-period` ≥ 30s for a Next.js app.

---

## 3. Specification

### Objective

Ship a deployable Next.js app in `todo/` that lets a user register, log in, manage their own todo lists and items, and share individual lists with other registered users as equal contributors.

### Scope

**In scope:**
- Email/password registration and login (next-auth Credentials + JWT, bcrypt-hashed passwords).
- Full CRUD on lists (create, rename, delete; read = list detail view).
- Full CRUD on list items (add, edit title, toggle done, delete).
- Deterministic sort: undone items before done items, stable secondary order within each group.
- Sharing a list by inviting another user via their registered email; shared users get full contributor access (view + add/edit/check/delete items) but cannot rename/delete the list or manage its sharing.
- Deployment artifacts: `Dockerfile`, `.github/workflows/deploy.yml`, `/healthz` route, DB migration runner — all conforming to `vps/MANAGED_PROJECT_GUIDE.md`.

**Out of scope (v1):**
- Email verification, password reset, OAuth/passkey login.
- Inviting an email address that has no existing account (returns an error; invitee must register first, then be invited).
- Viewer-only (read-only) sharing role — all shared access is contributor-level.
- Real-time sync/websockets — standard request/response with revalidation is sufficient.
- Drag-to-reorder of items — sort order is derived automatically (see below), not manually adjustable.
- Multi-list bulk operations, due dates, reminders, attachments, tags — none of these were requested.

### Data model

| Table | Columns | Notes |
|---|---|---|
| `user` | `id` (uuid pk), `email` (text, unique, lowercased), `password_hash` (text), `name` (text, nullable), `created_at` (timestamp) | No Auth.js `account`/`session`/`verificationToken` tables needed — Credentials + JWT only, no DB sessions, no OAuth. |
| `list` | `id` (uuid pk), `name` (text), `owner_id` (fk `user.id`), `created_at`, `updated_at` | Owner has full control. |
| `list_member` | `list_id` (fk `list.id`), `user_id` (fk `user.id`), `invited_by` (fk `user.id`), `created_at` | PK `(list_id, user_id)`. Represents a contributor invited to the list (owner is *not* duplicated here — ownership is checked via `list.owner_id`). |
| `list_item` | `id` (uuid pk), `list_id` (fk `list.id`), `title` (text), `done` (boolean, default false), `position` (integer), `created_at`, `updated_at` | `position` is assigned as an auto-incrementing per-list counter at creation time and never changes; it is only used as the secondary sort key. |

**Sort rule:** items are ordered by `done ASC, position ASC`. New items get `position = max(position for that list) + 1`. Checking/unchecking an item changes only `done`, never `position` — so within each group (undone / done) items retain creation order.

### Access control rules

- A user can access list `L` if `L.owner_id = user.id` OR a `list_member` row exists for `(L.id, user.id)`.
- Only `L.owner_id = user.id` may: rename `L`, delete `L`, add/remove `list_member` rows.
- Any user with access (owner or member) may: create/edit/toggle/delete items in `L`.
- All list/item routes return 404 (not 403) for lists the user cannot access, to avoid leaking list existence.

### Interfaces

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/register` | page | public | Registration form → creates `user`, auto-signs-in, redirects to `/`. |
| `/login` | page | public | next-auth Credentials sign-in form. |
| `/api/auth/*` | — | public | next-auth handler (unchanged framework routes). |
| `/api/register` | POST | public | `{ email, password, name? }` → 201 + session, or 409 if email taken. |
| `/` | page | required | Lists the user's own lists + lists shared with them. |
| `/lists/[id]` | page | required (access check) | List detail: items (sorted), add-item form, member list, invite form (owner only), rename/delete controls (owner only). |
| `POST /api/lists` | POST | required | `{ name }` → creates list, current user becomes owner. |
| `PATCH /api/lists/[id]` | PATCH | required, owner-only | `{ name }` → renames list. |
| `DELETE /api/lists/[id]` | DELETE | required, owner-only | Deletes list (cascade items + members). |
| `POST /api/lists/[id]/items` | POST | required, access-checked | `{ title }` → appends item at end of undone group. |
| `PATCH /api/lists/[id]/items/[itemId]` | PATCH | required, access-checked | `{ title? , done? }` → updates item. |
| `DELETE /api/lists/[id]/items/[itemId]` | DELETE | required, access-checked | Deletes item. |
| `POST /api/lists/[id]/members` | POST | required, owner-only | `{ email }` → adds `list_member` if a user with that email exists; 404 if not. |
| `DELETE /api/lists/[id]/members/[userId]` | DELETE | required, owner-only | Removes a contributor. |
| `GET /healthz` | GET | public | Returns 200, used by Docker `HEALTHCHECK` and platform deploy gate. |

### Behavior examples (one per acceptance-criteria group)

- **Register:** submitting `{email: "a@x.com", password: "hunter22"}` to `/register` with no existing user at that email creates the account, signs the user in, and redirects to `/`. Submitting the same email again shows "Email already registered" and does not create a second row.
- **Sorting:** a list with items A(done=false), B(done=true), C(done=false) created in that order displays as A, C, B — undone items first, each group in creation order.
- **Sharing:** owner invites `bob@x.com` (an existing user) to list L. Bob now sees L on his `/` page, can open `/lists/L`, add/check/delete items, but the rename/delete/invite controls are hidden (or return 403 if called directly).
- **Access control:** a user with no relationship to list L requesting `/lists/L` or any `/api/lists/L/*` route gets a 404.

### Acceptance criteria

- [ ] Given no account exists for `email`, when a user submits valid registration data, then a `user` row is created with a bcrypt password hash and the user is signed in.
- [ ] Given an account already exists for `email`, when a user submits registration with that email, then the request is rejected with a clear error and no duplicate row is created.
- [ ] Given a registered user, when they submit correct credentials to `/login`, then they receive a valid session and are redirected to `/`; incorrect credentials show an error and create no session.
- [ ] Given an authenticated user, when they create a list with a name, then the list appears on their `/` page with them as owner.
- [ ] Given a list owner, when they rename or delete their list, then the change is persisted and reflected immediately; a non-owner attempting the same action is rejected.
- [ ] Given a list the user can access, when they add an item, then it appears in the undone group at the end of creation order.
- [ ] Given a list with a mix of done/undone items, when the list is rendered, then undone items appear before done items, each group in stable creation order.
- [ ] Given an item in a list the user can access, when they toggle its done state, then only `done` changes (position and order within its new group by creation time are preserved) and the item moves to the correct group on next render.
- [ ] Given a list owner, when they invite an existing registered user by email, then that user gains contributor access (visible on their `/`, can view/add/edit/check/delete items) but cannot rename/delete the list or manage sharing.
- [ ] Given a list owner, when they invite an email with no matching account, then the request is rejected with an error indicating no such account exists.
- [ ] Given a user with no ownership or membership relationship to a list, when they request that list's page or API routes, then they receive a 404.
- [ ] Given the built Docker image, when run with a valid `DATABASE_URL` and port mapping, then `GET /healthz` returns 200 within the configured `--start-period` and `docker inspect` reports the container `healthy`.

### Decisions

| Decision | Alternatives considered | Rationale | Reversal cost |
|---|---|---|---|
| Reuse dashboard's Next.js/Drizzle/next-auth/bcrypt stack | Separate API + SPA (e.g. Express + React); different ORM (Prisma) | Proven on this exact VPS, one container simplifies deployment, no new operational pattern to validate | Low — stack is per-project, doesn't affect other projects |
| Single "contributor" role for sharing (no viewer-only) | Two roles (viewer/editor) | Matches the literal requirement ("see and contribute"); avoids building a permission dimension nobody asked for | Medium — adding a role later means a migration + UI for role selection, but the `list_member` table already isolates this cleanly |
| Invite requires invitee to already have an account | Store pending invites by email, auto-attach on that email's future registration | Keeps v1 scope small (no invite-token/email-sending infrastructure); acceptable since it's a small, presumably known set of users | Low — pending-invite table can be added later without touching existing tables |
| No email verification | Verification-link flow via SMTP | Avoids an SMTP dependency and matches the dashboard's existing precedent on this platform | Low — can be layered on top of the existing `user` table (`emailVerified` column) later |
| `position` fixed at creation, sort computed as `(done, position)` | Manual drag-to-reorder with reindexing | Nothing in the requirement asks for manual reordering; fixed-position + done-based grouping satisfies "sorted, unchecked first" with far less code | Low — a `position` column already exists to build manual reordering on top of later |

---

## 4. Task definitions

### Task: Project scaffold, schema & deploy plumbing

**Objective:** Stand up the Next.js project in `todo/` with the Drizzle schema, migration runner, health endpoint, Dockerfile, and GitHub Actions deploy workflow, so every later task has a running app and DB to build against.
**Spec:** Section 3, Data model + Interfaces (`/healthz` only) + platform constraints in Section 2.
**Scope:**
- Files to create: `todo/package.json`, `todo/next.config.ts`, `todo/tsconfig.json`, `todo/tailwind.config.ts`, `todo/postcss.config.mjs`, `todo/src/app/layout.tsx`, `todo/src/app/healthz/route.ts` (or `/api/healthz`), `todo/src/lib/db/schema.ts`, `todo/drizzle/0000_init.sql`, `todo/drizzle.config.ts`, `todo/scripts/migrate.mjs`, `todo/Dockerfile`, `todo/.dockerignore`, `todo/.gitignore`, `todo/.github/workflows/deploy.yml`, `todo/.env.example`.
- Files to modify: none (greenfield).
- Files explicitly excluded: anything under `vps/` (reference only, read-only) and `davor-software-factory/`.
**Inputs:** This spec; `vps/dashboard` as a structural reference (do not copy dashboard-specific code like passkeys, container inspection, deploy worker — only the patterns: migration runner shape, Dockerfile shape, workflow shape).
**Outputs:** A Next.js app that builds, runs `docker build`, and reports healthy locally with a throwaway Postgres.
**Acceptance criteria:**
- [ ] Given the repo, when `npm run build` is run, then it completes with no errors.
- [ ] Given a local Postgres and `DATABASE_URL` set, when the container starts, then `scripts/migrate.mjs` applies `0000_init.sql` idempotently before the server starts.
- [ ] Given the built image run locally with `-p 3000:3000`, when `docker inspect --format='{{.State.Health.Status}}'` is checked after the start period, then it reports `healthy`.
**Dependencies:** none — first task.
**Open decisions:** none.

---

### Task: Authentication (register, login, session)

**Objective:** Implement email/password registration and login using next-auth Credentials + JWT, matching the resolved spec.
**Spec:** Section 3, Interfaces (`/register`, `/login`, `/api/register`, `/api/auth/*`), Acceptance criteria (register/login group).
**Scope:**
- Files to create: `todo/src/auth.ts`, `todo/src/auth.config.ts`, `todo/src/middleware.ts`, `todo/src/app/api/auth/[...nextauth]/route.ts`, `todo/src/app/api/register/route.ts`, `todo/src/app/register/page.tsx`, `todo/src/app/login/page.tsx`, `todo/src/lib/db/index.ts` (db client, if not already from Task 1).
- Files to modify: `todo/src/lib/db/schema.ts` (only if `user` table needs adjustment from Task 1's draft).
- Files explicitly excluded: list/item routes (Tasks 3–4), sharing routes (Task 5).
**Inputs:** Task 1's schema and running app.
**Outputs:** Working register/login/logout flow; unauthenticated requests to any non-public route redirect to `/login`.
**Acceptance criteria:** the three register/login criteria from Section 3.
**Dependencies:** Project scaffold, schema & deploy plumbing.
**Open decisions:** none.

---

### Task: List CRUD

**Objective:** Let an authenticated user create, view, rename, and delete their own lists.
**Spec:** Section 3, Interfaces (`/`, `/lists/[id]` shell, `/api/lists*`), Acceptance criteria (list CRUD group).
**Scope:**
- Files to create: `todo/src/app/page.tsx`, `todo/src/app/lists/[id]/page.tsx` (list shell — items UI comes in Task 4), `todo/src/app/api/lists/route.ts`, `todo/src/app/api/lists/[id]/route.ts`, `todo/src/lib/lists.ts` (access-check helpers used by this and later tasks).
- Files to modify: `todo/src/lib/db/schema.ts` (add `list` table if not already present).
- Files explicitly excluded: item routes/UI, member/sharing routes/UI.
**Inputs:** Auth session from Task 2.
**Outputs:** A user can create, rename, delete lists; sees only lists they own (sharing arrives in Task 5, so `/` shows owned lists only until then).
**Acceptance criteria:** the list-create and rename/delete criteria from Section 3.
**Dependencies:** Authentication (register, login, session).
**Open decisions:** none.

---

### Task: List items (CRUD, checking, sorting)

**Objective:** Let a user with access to a list add, edit, check/uncheck, and delete items, with undone-first sorting.
**Spec:** Section 3, Data model (`list_item`), Interfaces (`/api/lists/[id]/items*`), Acceptance criteria (item + sorting group).
**Scope:**
- Files to create: `todo/src/app/api/lists/[id]/items/route.ts`, `todo/src/app/api/lists/[id]/items/[itemId]/route.ts`, `todo/src/app/lists/[id]/_components/ItemList.tsx`, `todo/src/app/lists/[id]/_components/AddItemForm.tsx`.
- Files to modify: `todo/src/lib/db/schema.ts` (add `list_item` table), `todo/src/app/lists/[id]/page.tsx` (render items via the access-check helper from Task 3).
- Files explicitly excluded: sharing/member UI and routes.
**Inputs:** List CRUD + access-check helper from Task 3.
**Outputs:** Full item lifecycle with correct sort order on every render.
**Acceptance criteria:** the add-item, sorting, and toggle-done criteria from Section 3.
**Dependencies:** List CRUD.
**Open decisions:** none.

---

### Task: List sharing (invite / remove contributors)

**Objective:** Let a list owner invite an existing registered user by email as a contributor, and remove contributors; enforce access control across all list/item routes.
**Spec:** Section 3, Data model (`list_member`), Access control rules, Interfaces (`/api/lists/[id]/members*`), Acceptance criteria (sharing + access-control group).
**Scope:**
- Files to create: `todo/src/app/api/lists/[id]/members/route.ts`, `todo/src/app/api/lists/[id]/members/[userId]/route.ts`, `todo/src/app/lists/[id]/_components/MembersPanel.tsx`.
- Files to modify: `todo/src/lib/db/schema.ts` (add `list_member` table), `todo/src/lib/lists.ts` (extend access-check to include membership, not just ownership), `todo/src/app/page.tsx` (include shared lists, not just owned), `todo/src/app/lists/[id]/page.tsx` (show members panel, gate owner-only controls).
- Files explicitly excluded: none within sharing scope.
**Inputs:** List + item CRUD from Tasks 3–4; user lookup by email from Task 2.
**Outputs:** Invited users see and contribute to shared lists; only owners manage sharing; non-members get 404 on access attempts.
**Acceptance criteria:** the sharing and access-control criteria from Section 3.
**Dependencies:** List items (CRUD, checking, sorting).
**Open decisions:** none.

---

## 5. Approval package

**Summary:** Build a Next.js todo app (email/password auth, list CRUD, sortable checkable items, single-role list sharing) in `todo/`, deployed as a new managed project (`slug: todo`, `todo.codes.hr`) on the existing VPS platform, using the shared Postgres cluster via the platform's auto-provisioned per-project database.

**Acceptance criteria:** see Section 3 (12 criteria) — each is independently testable and mapped to one of the five tasks below.

**Files affected:** entirely new tree under `todo/`; no changes to `vps/` or `davor-software-factory/`.

**Tasks (in dependency order):**
1. Project scaffold, schema & deploy plumbing
2. Authentication (register, login, session)
3. List CRUD
4. List items (CRUD, checking, sorting)
5. List sharing (invite / remove contributors)

**Open decisions deferred to implementer:** none — all four decisions surfaced during planning were resolved with the user before this document was written (Section 1 table, Section 3 decisions table).

**Risks / unknowns:**
- The GitHub repo for `todo/` doesn't exist yet — needs to be created and pushed before the deploy workflow can run (human step, see Section 6).
- The `todo` project has not been registered in the `vps.codes.hr` dashboard yet, so no `WEBHOOK_URL`/`WEBHOOK_SECRET` exist (human step, see Section 6).
- DNS for `todo.codes.hr` has not been confirmed as created (human step, see Section 6).
- None of these block Implement — they only block the final `git push` to `main` that triggers a live deploy. Tasks 1–5 can be fully implemented and verified locally (build + `docker run` + local Postgres) without them.

---

## 6. External setup required (human action, not automatable by this agent)

Per `vps/MANAGED_PROJECT_GUIDE.md`, before the first production deploy can succeed:

- [ ] Create a GitHub repository for `todo/` and push the code.
- [ ] Register the project in the `vps.codes.hr` dashboard: slug `todo`, image `ghcr.io/<owner>/todo`, port `3000`, healthcheck path `/healthz`, "Provision database" toggled on, domain `todo.codes.hr`.
- [ ] Copy the `WEBHOOK_URL` and `WEBHOOK_SECRET` the dashboard prints and add them as GitHub repo secrets.
- [ ] Create the DNS record for `todo.codes.hr` pointing at the VPS.
- [ ] Push to `main` and watch the deployment go `pending → running → success` in the dashboard.

---

## Next step

This plan is ready for approval. Per `davor-software-factory` doctrine ("No implementation without a specification," "Approval is obtained in writing"), Implement should not start on Task 1 until this document is explicitly approved (or revisions are requested).
