# ASEMS UI update

This update is limited to the login-page branding and login-page theme styling.

## Changes
- Removed the `/mylogo.png` Ambo University emblem image from the login-page branding. The project can still contain the image file, but the login page no longer references it.
- Replaced the image with a simple graduation-cap icon.
- Added the subtitle `Academic Affairs Staff Evaluation System` under `Ambo University` in the brand area.
- Added a `Login` link to the right of the theme toggle in the login-page top bar.
- Added/adjusted login-page dark-theme styling for readable surfaces, borders, and inputs.
- Kept the login API request, password visibility toggle, route behavior, backend, database, and other application pages unchanged.

## Run locally
In the frontend directory:

```powershell
npm install
npm run dev
```

The frontend `.env` points to `http://127.0.0.1:5000/api`. Keep this aligned with the backend address and CORS configuration.
