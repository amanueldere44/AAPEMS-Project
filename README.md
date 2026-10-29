# ASEMS

Ambo University Academic and Administrative Performance Evaluation System.

## Current implementation

- React + Vite + Tailwind frontend shell
- Node.js + Express API
- Integration with the existing MySQL schema `ambo_performance_evaluation`
- JWT login using the existing `users` table and bcrypt hashes
- Role gates, evaluator-owned assignment access, form/criteria retrieval, draft saves, submission, component summary recomputation, approval queue/actions, report summaries, and audit logging

The API uses the user's existing schema. It does not automatically import SQL, create duplicate tables, or run destructive migrations.

## Requirements

- Node.js 20 LTS or newer
- npm
- MySQL 8.x
- Git (recommended)

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

Edit `backend/.env` with the credentials for your existing `ambo_performance_evaluation` database and set a unique random `JWT_SECRET` (at least 32 characters). Use a least-privilege MySQL account, not root. Never commit `.env`.

## Frontend setup

```bash
cd ../frontend
npm install
cp .env.example .env
```

Set `VITE_API_BASE_URL=http://localhost:5000/api` for local development.

## Run both applications

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). Check process health at `http://localhost:5000/api/health`; the backend also logs whether MySQL connectivity was verified at startup.

## API documentation

See `docs/api-documentation.md` for endpoints, request bodies, role mapping, scoring behavior, and current schema caveats.

## Important caveats before official use

- The supplied dump includes `DROP TABLE IF EXISTS`; back up the database before manually importing it.
- The dump has parallel section sets (`form_sections` IDs 1–19 and 39–56). The API currently serves IDs 1–19 until the institution confirms which set is authoritative.
- The dump contains some seeded evaluation scores whose criterion IDs do not appear to match their assignment form. Do not rely on seeded sample evaluations as official data; validate/clean them in a backed-up development copy.
- NA is provisionally excluded from component averages. Confirm official NA, missing-response, and rounding rules before production use.
- The frontend still contains illustrative dashboard figures and is not yet wired to all API endpoints. The API syntax and package manifests were checked, but database-backed integration tests have not been run in this environment.
