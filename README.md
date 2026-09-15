# LeadPath (working title) — Weatherhead Leadership Practice

> **Product name TBD.** `LeadPath` is a placeholder. Branding remains Case Western Reserve University / Weatherhead School of Management.

Next.js 16 (App Router) + HeroUI practice platform for undergraduate leadership skill development. Students practice **1:1 avatar conversations** across three P1 topics, track growth over time, and follow a personalized learning plan.

## Practice topics (P1)

1. **Practice Interviews** — behavioral, technical, and leadership interviews
2. **Practice Pitches** — persuasive pitches to investors, executives, faculty, stakeholders
3. **Courageous Conversations** — conflict resolution, feedback delivery, accountability

Later topics (networking, leading meetings, multi-party case consulting) and **video/image analysis** (eye contact, posture, lighting, etc.) are deferred.

## Student experience

| Area | Route | Purpose |
|------|-------|---------|
| Practice hub | `/practice` | Navigate topics and assigned scenarios |
| Topic list | `/practice/[topic]` | Scenarios for one topic |
| Play | `/case-play/[caseId]` | 1:1 avatar/chat practice session |
| Progress | `/progress` | Duolingo-style skill levels, trends, attempt history |
| Learning plan | `/plan` | Focus skills + recommended in-app practice trials |
| Settings | `/student-cases/settings` | Account settings |

After an assessed attempt, the system scores **rubric skill dimensions** (communication, substance, presence proxies, EI/leadership), updates skill progress, and regenerates a learning plan with tailored scenario recommendations.

## Admin / instructor

- **Scenarios** (`/case-management`) — author scenarios tagged by topic with a single counterpart persona
- **Avatar profiles** — HeyGen video/voice profiles
- **Cohorts** (`/codes`) — enrollment, assignments, gradebook
- **Kiosk + CTA** — physical lobby displays and lead-capture QR flow (kept)

## Technologies

- [Next.js 16](https://nextjs.org/docs/getting-started) + Turbopack
- [HeroUI v2](https://heroui.com/) + Tailwind CSS
- PostgreSQL via Prisma (users, attempts, skill progress, learning plans)
- AWS S3 (scenario JSON, interaction logs, avatars, CTA)
- OpenAI (chat + rubric evaluation), HeyGen (streaming avatars), Pinecone (optional RAG)
- JWT auth + CWRU CAS SSO

## How to use

```bash
npm install
cp .env.template .env.local   # or use the checked-in guidance below
# At minimum set JWT_SECRET in .env.local (a dev fallback exists if unset)
npm run dev      # http://localhost:3000
npm run build
npm run start
```

### Local UI without Postgres

You can log in and navigate the app **without** `DATABASE_URL`:

1. Create `.env.local` with at least `JWT_SECRET=...` (see `.env.template`)
2. Restart `npm run dev`
3. Sign in with seed credentials (e.g. `admin@example.com` / `admin123` or `student@case.edu` / `student123`)

In this mode Progress / Plan / Practice / Scenarios show **placeholder demo data** (yellow “Demo” banner) so you can preview the UI. Live avatar chat and scoring still need API keys. Force placeholders anytime with `FORCE_DEMO_DATA=1` in `.env.local`.

When you have Postgres:

```bash
# set DATABASE_URL in .env.local, then:
npx prisma db push
npx prisma db seed
```

Required env for full stack: `JWT_SECRET`, `DATABASE_URL`. Feature keys (OpenAI, HeyGen, AWS, Pinecone) only when using those features.

```bash
npx prisma db push
npx prisma db seed
npx prisma generate
```

## Authentication

### Email / password (dev)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | admin123 |
| Professor | professor.smith@case.edu | prof123 |
| Student | student@case.edu | student123 |

(See `prisma/seed.ts` for the full seed user list.)

### CWRU SSO

Sign in with CWRU SSO → CAS at `login.case.edu` → callback `/api/auth/cwru-sso-callback` → JWT session cookie.

### JWT

```bash
openssl rand -base64 48
```

## Deferred (not in this codebase pass)

- Camera / body-language / video analysis against the Interview Observation Rubric visual items
- Multi-avatar meetings and networking event simulations
- Final product naming beyond the `LeadPath` placeholder
