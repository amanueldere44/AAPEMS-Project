# ASEMS landing page and login update

This update adds a public ASEMS landing page at `/` for signed-out users. The Login button in the landing-page top bar opens `/login`. After successful authentication, the existing protected workspace and dashboard remain at `/`.

Changes in this update:
- Added `frontend/src/pages/LandingPage.jsx` with ASEMS-specific academic staff evaluation messaging.
- Simplified `frontend/src/pages/LoginPage.jsx` by removing the requested marketing copy, security notice, and duplicate footer while preserving email/password sign-in, validation, password visibility, and API authentication.
- Removed the theme toggle from the signed-in workspace header. The theme toggle is available on the public landing page only, and the authenticated workspace is reset to light mode.
- Added translations for the new landing/login copy to the existing English, Afaan Oromoo, and Amharic language system.
- Kept existing backend and database source files unchanged.

## Run locally

From `frontend`:

```powershell
npm install
npm run dev
```

The production build was not verified in the preparation environment because Vite dependencies were not installed and `npm install` did not complete within the available time. Test locally before deploying.

Note: the existing translation dictionary still needs a full page-by-page audit to guarantee that every text node, placeholder, table value, validation message, modal, and dynamically generated label has a translation in Afaan Oromoo and Amharic. This update does not claim complete line-by-line coverage of the entire application.
