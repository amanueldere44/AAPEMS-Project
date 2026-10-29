# ASEMS API (schema-integrated first implementation)

Base URL: `http://localhost:5000/api`

All JSON responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": ..., "message": ... } }`. Except login and health, endpoints require `Authorization: Bearer <token>`.

## Authentication

- `POST /auth/login` — body `{ "email": "...", "password": "..." }`; validates the existing `users` table's bcrypt password hash and active status, returns a JWT and safe user profile.
- `GET /auth/me` — current user's safe profile.

## Dashboard and reference data

- `GET /health` — process health (does not prove DB availability).
- `GET /dashboard` — assignment counts, recent cycles, and recent assignments. Non-admin users see their own evaluator assignments.
- `GET /forms` — active form metadata, weights, sections, criteria, and the current rating scale.
- `GET /assignments` — assignments assigned to the signed-in evaluator; admin can see all.
- `GET /assignments/:id` — assignment and saved score rows; evaluator ownership is checked except for admin.

## Evaluation submissions

- `PUT /evaluations/:assignmentId/draft` — saves a draft and replaces its score rows atomically. Body example:

```json
{
  "scores": [
    { "criterionId": 1, "score": 5 },
    { "criterionId": 2, "score": "NA" }
  ],
  "commentStrengths": "Optional strengths",
  "commentImprovements": "Optional areas for improvement"
}
```

`score` accepts integer `0` through `5`, or the string `"NA"`. The API validates that each criterion belongs to the assignment's form and rejects duplicates. Submitted and approved evaluations are locked from draft edits. Only assignments in active cycles can be saved/submitted.
- `POST /evaluations/:assignmentId/submit` — requires a saved response for every criterion in the selected criteria set. Computes the component average from numeric scores and component weighted score as `average × form weight ÷ 5`; records submission time and audit log.

The instructor's final total is held at zero and summary status remains `incomplete` until all four evaluator types have submitted at least one component evaluation for that instructor and cycle. The component weighted values can be visible while the total remains unavailable. The summary is recalculated transactionally after a submission.

## Review and reporting

- `GET /workflow/queue` — submitted evaluations awaiting the current approval stage.
- `POST /workflow/:evaluationId/review` — body `{ "action": "approved" | "returned" | "rejected", "comment": "..." }`.
- `GET /reports/summaries?cycleId=<id>` — summary report; department heads are scoped to instructors whose employee record shares their department. Other report roles are `admin`, `committee`, `dean`, and `management`.

The approval stage is derived from approved review records and enforced in order: `committee` → `department_head` → `dean` (College) → `management` (VP's Office). This uses existing role values; no role enum or table migration is required for this mapping. Final summary status changes to `reviewed` only when all four component types exist and all evaluations for that instructor/cycle are approved.

## Schema compatibility notes / open decisions

- Configure `DB_NAME=ambo_performance_evaluation` to match the supplied SQL dump. The backend does not import, reset, or modify the schema automatically.
- The dump has two parallel section sets for each evaluation form: section IDs `1–19` and `39–56`. Until the institution confirms which is authoritative, the API deliberately serves the original lower-ID set (`1–19`) so criteria are not duplicated in the user interface. This is a conservative compatibility choice, not a claim that the duplicate set is invalid. Confirm the intended set before production use.
- The schema has an `instructors` table, but assignment and summary foreign keys point to `users`. API behavior follows the foreign keys and treats `users` as the instructor identity source; `employees` supplies department scoping where available.
- NA is excluded from the component mean for now. The official policy for NA, missing answers, rounding, and minimum valid responses has not been supplied/confirmed; confirm before using calculated scores for official decisions.
- A single submitted evaluation's `weighted_score` is a component contribution, not the instructor's final score.
- The dump includes seeded accounts and audit history. Do not publish or commit real user records, hashes, or local secrets. Back up the database before any manual import because the dump contains `DROP TABLE IF EXISTS` statements.

## Security and implementation status

JWT authentication, bcrypt password verification, active-account checks, role gates, evaluator ownership checks, parameterized SQL, input validation, transactions, rate limiting, security headers, and audit events are implemented in this first API layer. Configure a unique random `JWT_SECRET` (at least 32 characters) and database credentials in `backend/.env`; do not use the example values in production. Logout is client-side token removal because the current schema has no token-revocation table. Before production, add automated integration tests, HTTPS, refresh/revocation strategy if required, and institution-approved rules for NA/rounding and criteria-set selection.
