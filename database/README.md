# Existing database integration

ASEMS uses the user's existing `asems.sql` schema/database (`ambo_performance_evaluation`) as the source of truth. No duplicate schema is generated and no automatic migration/import runs when the API starts.

## Connection

Set `DB_NAME=ambo_performance_evaluation` in `backend/.env`, along with the correct local MySQL host, port, app username, and password. Use a least-privilege database account.

## Compatibility decisions

- Evaluation identity and assignment foreign keys point to `users`; the API follows that design rather than switching to the currently empty `instructors` table.
- `dean` is mapped to the College approval stage; `management` is mapped to the VP's Office stage. The stored role enum is unchanged.
- The dump contains parallel criteria sections (`form_sections` IDs 1–19 and 39–56). The API serves IDs 1–19 until the owner confirms which set is official.
- No destructive DDL is needed for the current API endpoints.

Before any manual schema import, make a backup: the dump includes `DROP TABLE IF EXISTS` statements and will replace tables/data.
