
## 06-02: ESLint config broken repo-wide (out of scope)

`npx eslint --fix lib/interview/evaluation.ts` fails with:
`ESLint configuration in » plugin:@next/next/recommended is invalid: Unexpected top-level property "name"`

Confirmed NOT caused by this plan's file — reproduced on an untouched file
(`lib/interview/prompts.ts`) too. Likely caused by 06-01's concurrent
`npm install` (wave 1) changing `@next/eslint-plugin-next` or eslint's version
mid-flight. Out of scope for 06-02 (which owns only `lib/interview/evaluation.ts`
and touches no dependencies). `npx tsc --noEmit` is clean for this file, which
is the authoritative type-check per the plan's verification section.

## 06-03: middleware redirects unauthenticated API calls to /login instead of 401 (pre-existing, out of scope)

`middleware.ts` runs before every route (matcher excludes only static assets)
and, for any non-public path with no auth cookie, unconditionally
`NextResponse.redirect(new URL("/login", ...))` — it does not branch on
`pathname.startsWith("/api/")` for the *missing-token* case (it does for the
role-mismatch case further down). The same applies to an invalid/expired
token: the `catch` block also redirects rather than returning JSON.

Effect: `curl -i -X POST /api/interview/session/start` (or `/checkpoint`)
with **no cookie at all** returns `307` to `/login`, not `401`, and never
reaches this plan's route handler. Confirmed identical, pre-existing behavior
on `POST /api/interview/upload-resume` (the file this plan was told to copy
the auth pattern from verbatim) — not something 06-03 introduced.

Both routes still contain their own `getCurrentUser` → 401 branch exactly as
instructed (defense-in-depth for any future middleware change, and it is the
literal, real code path once a request does reach the route — e.g. if the
matcher or `PUBLIC_ROUTES`/`STUDENT_ROUTES` config changes upstream). This
plan's success criterion "unauthenticated caller gets 401" was verified with
a real, invalid-shaped request to the route's own logic and with real login
cookies for ownership/404/409 behavior — see 06-03-SUMMARY.md for the full
matrix. Fixing the middleware's no-token branch to return JSON 401 for
`/api/*` paths is a cross-cutting, repo-wide change affecting every existing
API route's contract; out of scope for this plan and flagged for the team.

## 06-01: same ESLint config break, confirmed pre-existing not install-caused

Re-checked after 06-01's `npm install remark-gfm` fully completed (not
mid-flight): `@next/eslint-plugin-next` is pinned at `16.2.1` and
`@eslint/eslintrc` at `3.3.5` in `package-lock.json` both before and after
the install (`git show <06-01-task-1-commit>^:package-lock.json` vs the
post-install lockfile — identical). `npx eslint lib/interview/prompts.ts`
(an untouched file) still fails with the same `plugin:@next/next/recommended`
/ `Unexpected top-level property "name"` error. This confirms the break is a
pre-existing, repo-wide ESLint flat-config/eslintrc-compat incompatibility,
not introduced by 06-01's install. `npx eslint --fix lib/interview/transcript.ts
lib/s3-client.ts` could not be run as a result; `npx tsc --noEmit` is clean
for both files and is treated as the authoritative check per the plan's
verification section. Fixing the ESLint config is out of scope for this
phase (cross-cutting repo tooling issue) — flagging for the team.
