# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a Next.js 16 (App Router, Turbopack) monolith — **LeadPath** (working title), a Weatherhead School of Management / Leadership Institute practice platform for interviews, pitches, and courageous conversations. Physical **kiosk** and **CTA** flows are still included.

**Data Storage Architecture:**
- **PostgreSQL** (via Prisma ORM) — users, cohorts, scenarios (Case model), attempts, skill progress, learning plans
- **AWS S3** — scenario JSON, interaction logs, images, avatar profiles, CTA data

See `README.md` for standard commands (`npm install`, `npm run dev`, `npm run build`).

### Practice topics

| Topic key | Label |
|-----------|-------|
| `interview` | Practice Interviews |
| `pitch` | Practice Pitches |
| `courageous_conversation` | Courageous Conversations |

Student entry: `/practice`. Progress: `/progress`. Learning plan: `/plan`.

Video/image analysis is **out of scope** for now; rubric scoring uses chat/transcript dimensions only.

### Database Schema

Key models in `prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `User` | admin / professor / student / kiosk |
| `Session` | Login session tracking |
| `Cohort` / `CohortMember` | Course sections |
| `Case` | Practice scenarios (topic + target skills) |
| `CaseAssignment` | Assignments to students |
| `Attempt` | Learning records with skillScores JSON |
| `SkillProgress` | Per-user skill EMA / XP / level |
| `LearningPlan` / `PlanActivity` | Personalized plan + recommended trials |
| `AuditLog` | Operation audit trail |

Role enum: `ADMIN`, `PROFESSOR`, `STUDENT`, `KIOSK`

### Database Commands (Prisma)

| Command | Purpose |
|---------|---------|
| `npx prisma db push` | Sync schema to database |
| `npx prisma db seed` | Fill test data |
| `npx prisma generate` | Regenerate Prisma Client after schema changes |
| `npx prisma studio` | Open database GUI in browser |
| `npx prisma db push --force-reset` | Reset database (⚠️ deletes all data) |

### Dev server

- `npm run dev` starts the Next.js dev server on port 3000 with Turbopack.
- Required env vars: `JWT_SECRET`, `DATABASE_URL` (set in `.env.local`).
- External service API keys (OpenAI, HeyGen, AWS S3, Pinecone) are required only for their respective features.

### Dev credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | admin123 |
| Professor | professor.smith@case.edu | prof123 |
| Professor | professor.chen@case.edu | prof123 |
| Student | student@case.edu | student123 |
| Student | alice.johnson@case.edu | student123 |

All test users are created by `prisma/seed.ts`.

### Known issues

- **ESLint**: The `eslint.config.mjs` wraps `plugin:@next/next/recommended` with `FlatCompat`, but `eslint-config-next@16` exports native flat config format. Running `npm run lint` fails with `Unexpected top-level property "name"`. This is a pre-existing config incompatibility, not an environment issue.
- **Middleware deprecation**: Next.js 16 shows a warning that the `middleware` file convention is deprecated in favor of `proxy`. The app still works correctly.

### Testing

There are no automated test suites (no Jest, Vitest, or similar) configured in this project. Validation is done via manual testing (dev server + browser).

### Lint / Build / Run

| Task | Command |
|------|-----------------|
| Lint | `npm run lint` (see known issue above) |
| Build | `npm run build` |
| Dev | `npm run dev` |
| Start | `npm run start` |
