# ASEMS requested additions — integrated project

This package is based on the uploaded ASEMS.zip. Existing application features and backend files were retained. The `.git` history and `node_modules` folders are excluded from this portable source archive; run `npm install` in frontend/backend to restore dependencies as appropriate.

## Added files
- `frontend/src/i18n/translations.js` — English-to-Amharic and English-to-Afaan Oromoo dictionary.
- `frontend/src/i18n/LanguageLayer.jsx` — language selector and dynamic exact-string translation.
- `frontend/src/components/ConfirmProvider.jsx` — reusable professional confirmation modal.
- `frontend/src/utils/confirmAction.js` — helper used by destructive actions.
- `frontend/src/styles/asems-addons.css` — styling for the selector and modal.

## Minimal existing-file integration edits
- `frontend/src/layouts/AppLayout.jsx`: adds the language selector and existing ThemeToggle to the header, adds the app-shell class for theme CSS, and mounts ConfirmProvider around the page outlet.
- `frontend/src/main.jsx`: imports the new CSS.
- `frontend/src/pages/AcademicUnitsPage.jsx`, `CoursesPage.jsx`, `CyclesPage.jsx`, `DepartmentsPage.jsx`, `FormsPage.jsx`, `LeadershipAssignmentsPage.jsx`, `LeadershipPage.jsx`, `OfficesPage.jsx`, `TasksPage.jsx`, `ImprovementPage.jsx`: routes selected remove/delete actions through the custom confirmation modal. Existing API calls are retained.

Other source files were copied unchanged from the uploaded archive.

## Run
PowerShell:
```powershell
cd frontend
npm install
npm run dev
```
Use your existing backend setup separately. This archive excludes `.env` files for safety; retain your local environment configuration from your original working copy.

## Translation coverage note
The translation system translates exact UI text strings that have entries in `translations.js`. The included dictionary covers the shared navigation/header and common controls, not every page-specific sentence, server-generated error, or all dynamic text in the application. Add each remaining exact visible string to both `am` and `om` dictionary objects to reach complete line-by-line translation. Login is English-only because the login page does not render AppLayout or the language selector.

## Theme note
The existing ThemeProvider, ThemeToggle, and theme stylesheet are retained. The existing ThemeToggle is now visible in the workspace header. Login page behavior is unchanged.
