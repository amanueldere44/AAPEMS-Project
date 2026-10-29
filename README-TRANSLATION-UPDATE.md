# ASEMS multilingual UI update

This update expands the existing English / Afaan Oromoo / Amharic UI dictionary while retaining the existing language selector and theme setup.

## Scope
- Added common page labels, form actions, status names, workflow messages, empty states, and validation messages to the Afaan Oromoo and Amharic dictionaries.
- Kept the login page English-only by leaving the language selector in the authenticated workspace layout.
- Preserved the existing backend, API calls, page components, route paths, database configuration, confirmation dialogs, border styling, and light/dark theme behavior.
- Light remains the default theme for users without a saved theme preference. A previously saved preference is still respected.

## Important verification note
The ZIP archive was checked for integrity and the translation dictionary JavaScript passed `node --check`. A full Vite production build was not run, so build status is unverified. This dictionary expansion covers many additional UI strings, but any literal UI text not present in the dictionary will remain English; review remaining strings page-by-page before considering translation coverage exhaustive.
