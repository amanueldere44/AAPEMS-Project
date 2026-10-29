# ASEMS targeted theme fix

Changes in this update are limited to:

- Removed the `Access ASEMS` hero button from the landing page. The existing top-bar Login button still opens the role-selection dialog.
- Removed the `AppLayout` effect that forcibly switched the theme to light after a user signed in. The selected theme now persists into the authenticated workspace using the existing `ThemeProvider` and `asems-theme` local-storage setting.
- Added workspace-scoped CSS overrides for common background, text, border, form, table, and dialog utility classes so light/dark themes apply more consistently across authenticated pages.

No backend, database, authentication, route, or evaluation workflow code was intentionally changed.

## Build note

A production build could not be run in this environment because frontend dependencies are not installed (`vite: not found`). From the `frontend` directory, run `npm install` and `npm run build` to verify locally.
