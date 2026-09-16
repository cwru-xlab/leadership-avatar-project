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
4. CWRU redirects back to the application with a CAS ticket
5. The application validates the ticket with CWRU's CAS server
6. Upon successful validation, user information is extracted and a JWT token is created
7. User is logged in and redirected to the main application

#### CWRU SSO Features:

- Automatic user creation for new CWRU users
- User information synchronization (name, email, student ID)
- Secure token-based session management
- Seamless integration with existing JWT authentication system

The SSO callback endpoint is available at `/api/auth/cwru-sso-callback` and handles the CAS ticket validation process.

### JWT

Generate a new JWT with this command

```bash
openssl rand -base64 48
```
