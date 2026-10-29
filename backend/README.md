# ASEMS backend

Express API integrated with the existing `ambo_performance_evaluation` MySQL schema. The API does not create, drop, or migrate tables automatically.

## Setup

1. Install Node.js 20+ and MySQL 8+.
2. Create/restore the existing database only if needed; back it up first. The supplied dump includes `DROP TABLE IF EXISTS` statements.
3. Copy `.env.example` to `.env` and configure DB access and a unique random `JWT_SECRET` of at least 32 characters.
4. Install dependencies: `npm install`.
5. Start development server: `npm run dev`.
6. API base URL: `http://localhost:5000/api`.

The backend defaults to `DB_NAME=ambo_performance_evaluation`, matching the supplied dump. Create a least-privilege database user for the app rather than using a MySQL root account.

## Implemented API groups

- `/auth` login and current user
- `/dashboard` current assignment counts and recent activity
- `/forms` form metadata and criteria
- `/assignments` evaluator-owned assignments and saved score details
- `/evaluations` draft save and submit
- `/workflow` sequential review queue/actions
- `/reports/summaries` instructor-cycle summary reports
- `/health` process health

See `../docs/api-documentation.md` for request examples, scoring rules, role mapping, and schema caveats.

## Important caveats

- The database dump's parallel form section sets are not silently merged; the API currently serves section IDs 1–19 pending confirmation of the authoritative set.
- NA is provisionally excluded from component averages. Official NA/missing/rounding rules must be confirmed.
- This is the first API implementation, not a production certification. Run integration tests against a backed-up development database before real evaluation data is processed.
