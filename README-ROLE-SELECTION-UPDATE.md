# ASEMS role-selection landing page update

This update changes only the public landing page, login-page role label, and theme styles needed for the requested interaction.

- Removed the About ASEMS navigation item; Home is the only public menu link before the theme toggle.
- Clicking Login or Access ASEMS opens a role selection dialog with the 11 requested categories.
- Selecting a category navigates to `/login` and displays the chosen category above the sign-in form. Existing email/password authentication request is unchanged.
- Added dark-theme styling for the landing page and role selection dialog so the home page and cards change with the theme.
- Existing authenticated workspace, API, database, and other page components were not intentionally modified.

The chosen role is currently an informational selection only. The existing login API still authenticates the account and the server remains responsible for authorization.

Run from `frontend`: `npm install` then `npm run dev`. Please test in the local browser; no production build/browser test was performed in this environment.
