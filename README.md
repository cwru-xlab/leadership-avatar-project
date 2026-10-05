# Case Western Reserve University Weatherhead School of Management AI Avatar Kiosk Project

This is the codebase for the Case Western Reserve University Weatherhead School of Management AI Avatar Kiosk Project, built using Next.js 16 (app directory) and HeroUI (v2)

## Technologies Used

- [Next.js 16](https://nextjs.org/docs/getting-started)
- [HeroUI v2](https://heroui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- JWT Authentication with dual login methods
- CWRU Single Sign-On (SSO) integration

## How to Use

### Install dependencies

You can use one of them `npm`, `yarn`, `pnpm`, `bun`, Example using `npm`:

```bash
npm install
```

### Set up your local environment

Create a `.env.local` with the values for this project (ask a maintainer), then run the
setup check:

```bash
npm run setup
```

This verifies every external dependency the app needs and applies any pending database
migrations. It prints a line per check, so a failure names the thing that is actually
wrong rather than surfacing later as an empty page or a confusing stack trace:

```
Local setup check

✓ env files              .env + .env.local
✓ required variables     all 8 present
✓ DATABASE_URL agreement .env and .env.local match
✓ prisma generate        client generated
✓ database connection    reachable
✓ migrations             up to date
✓ schema + data          9 user(s) present
✓ s3 read                leadership-avatar reachable (5 keys sampled)
✓ openai key             valid (gpt-4.1 reachable)
✓ heygen key             valid (5 avatar(s) available)

All checks passed.

Start the app with npm run dev
```

A failure looks like this, and tells you what to fix:

```
✗ s3 read      case-study-ai-avatar: 403 AccessDenied
  → either AWS_S3_BUCKET_NAME names the wrong bucket, or this IAM user lacks
    s3:ListBucket/s3:GetObject on it
```

#### Options

`npm` needs `--` before flags so they reach the script rather than npm itself:

```bash
npm run setup -- --seed          # also seed dev accounts (safe to re-run)
npm run setup -- --write-probe   # also verify S3 writes (temp object, then deleted)
npm run setup -- --no-migrate    # verify only, change nothing
```

Flags combine. Use `--seed` only when the database is empty — the script tells you when
that is the case. It refuses to run with `NODE_ENV=production` unless passed `--force`.

#### Required environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs auth cookies |
| `CWRU_CAS_CALLBACK_URL` | Exact registered production CAS callback URL; Preview and Production use the same value |
| `CWRU_ALLOWED_PREVIEW_HOST_PREFIX` | Project-specific Vercel deployment hostname prefix authorized to receive a preview handoff |
| `AUTH_HANDOFF_SECRET` | At least 32-byte, server-only secret shared by Preview and Production to sign five-minute SSO handoff assertions |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 access |
| `AWS_REGION` / `AWS_S3_BUCKET_NAME` | Which bucket holds cases and profiles |
| `OPENAI_API_KEY` | Chat + speech-to-text |
| `HEYGEN_API_KEY` | LiveAvatar sessions |

#### Notes for new contributors

- **The dev database and S3 bucket are shared.** Cases, cohorts, and interaction logs are
  common state — two people testing the same case at once will collide.
- **Never run `prisma migrate dev` or `prisma migrate reset`.** Both can offer to reset the
  database, which would wipe the shared dev data for everyone. `npm run setup` applies
  migrations with `migrate deploy`, which only applies what is pending. If the script warns
  that the migration history differs from your checkout, pull the latest migrations rather
  than resetting.
- **The Prisma CLI reads `.env`, not `.env.local`.** Keep `DATABASE_URL` identical in both,
  or `prisma` commands will target a different database than the app. `npm run setup` warns
  when they disagree.

### Run the development server

```bash
npm run dev
```

### Build the application

```bash
npm run build
```

### Run the production server

```bash
npm run start
```

## Authentication

The application supports two authentication methods:

### 1. Email/Password Authentication

For testing purposes, you can use these credentials:

- **Admin**: admin@example.com / admin123
- **User**: user@example.com / user123

### 2. CWRU Single Sign-On (SSO)

The application integrates with Case Western Reserve University's SSO system using the CAS (Central Authentication Service) protocol.

#### How CWRU SSO Works:

1. User clicks "Sign in with CWRU SSO" on the login page
2. User is redirected to `https://login.case.edu/cas/login`
3. User authenticates with their CWRU credentials
4. CWRU redirects to the single registered production callback with a CAS ticket
5. The production callback validates the ticket with CWRU's CAS server
6. For a preview login, production redirects back to that exact preview with a five-minute, single-use opaque handoff code
7. The target deployment redeems the code, creates its own host-only JWT cookie, and restores the original page

#### CWRU SSO Features:

- Automatic user creation for new CWRU users
- User information synchronization (name, email, student ID)
- Secure token-based session management
- Seamless integration with existing JWT authentication system

The SSO callback endpoint is available at `/api/auth/cwru-sso-callback` and must exactly match `CWRU_CAS_CALLBACK_URL`, the URL registered with CWRU CAS. Every deployment starts at `/api/auth/cwru-sso-start`; a Vercel Preview proves its exact deployment origin with a server-signed assertion, while the production callback remains the only CAS service URL. The callback never shares cookies across domains or places the 45-day JWT in a URL. Instead it uses a short-lived, one-time handoff code redeemed only by the original deployment.

Configure `CWRU_CAS_CALLBACK_URL`, `CWRU_ALLOWED_PREVIEW_HOST_PREFIX`, and `AUTH_HANDOFF_SECRET` in both Vercel Production and Preview. Set the prefix to the project-specific beginning of Vercel’s generated deployment hostname (including the trailing `-`), not merely `.vercel.app`; this prevents the registered production callback from redirecting to another Vercel project. Keep `AUTH_HANDOFF_SECRET` server-only, at least 32 bytes, and identical in those two environments. Previews also need their normal `DATABASE_URL` and `JWT_SECRET` because they issue their own local auth cookie after redemption.

### JWT

Generate a new JWT with this command

```bash
openssl rand -base64 48
```

### Preview SSO deployment checklist

Before deploying code that uses the CAS handoff, a human must apply
`20261102000000_add_auth_handoffs` to the target database using
[`docs/MIGRATIONS.md`](docs/MIGRATIONS.md). Then set `CWRU_CAS_CALLBACK_URL`
to the already registered production callback and set the same
`AUTH_HANDOFF_SECRET` in the Vercel **Production** and **Preview**
environments.

For a real CWRU CAS smoke test, open a protected route on a preview deployment
in a fresh browser profile and verify: preview login → production CAS callback →
the same preview’s `/api/auth/cwru-sso-redeem` endpoint → the original route.
Confirm the preview receives an `auth-token` cookie, the browser redirect URL
never contains that JWT, a copied redemption URL cannot be used twice, and the
same production-domain flow still succeeds. Vercel Deployment Protection must
allow the browser to reach the preview redemption endpoint.
