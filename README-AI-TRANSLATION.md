# ASEMS AI-assisted UI translation

This update adds AI translation as a fallback for visible interface text that is not already present in the existing English/Afaan Oromoo/Amharic dictionary. It is intended to change translation behavior only; the existing application pages, workflows, database, theme, and styles are left intact.

## Languages

- English: remains the source/default language.
- Afaan Oromoo: existing dictionary first, AI fallback for missing interface strings.
- Amharic: existing dictionary first, AI fallback for missing interface strings.

The login page remains English-only because its language switcher is not mounted there. User-specific database content such as table-cell values, personal names, and evaluation-cycle titles is excluded from AI fallback where practical; existing dictionary translations can still translate known status labels.

## Enable AI translation

1. Obtain an OpenAI API key with API access and billing configured.
2. Open `backend/.env` (create it from `backend/.env.example` if needed).
3. Add these settings to `backend/.env`:

   ```env
   OPENAI_API_KEY=your_private_api_key_here
   OPENAI_TRANSLATION_MODEL=gpt-5.5
   ```

4. Keep the API key in the **backend only**. Do not add it to any `VITE_` frontend environment variable or commit the real key to GitHub.
5. Restart the backend server.
6. Sign in, choose Afaan Oromoo or Amharic, and allow a moment for any uncached labels to be translated. Results are cached in the browser to reduce repeated API calls.

AI translation requires internet access from the backend and a working API key. If AI is not configured or unavailable, the existing dictionary translations still work. The endpoint requires an authenticated session and applies request-size and rate limits.

## Files changed for this translation-only update

- `frontend/src/i18n/LanguageLayer.jsx` — AI fallback, local cache, batching, and language application.
- `backend/src/routes/translation.routes.js` — authenticated AI translation endpoint.
- `backend/src/app.js` — mounts the translation endpoint.
- `backend/.env.example` — documents optional backend-only configuration.

No production build was run in the preparation environment because frontend dependencies were not installed.
