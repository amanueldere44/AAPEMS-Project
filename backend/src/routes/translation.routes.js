import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
const translationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Translation request limit reached. Please try again later.' },
});

const LANGUAGE_NAMES = {
  om: 'Afaan Oromoo (Oromo)',
  am: 'Amharic (አማርኛ)',
};

router.post('/ai', requireAuth, translationLimiter, async (req, res) => {
  const { targetLanguage, texts } = req.body ?? {};

  if (!Object.hasOwn(LANGUAGE_NAMES, targetLanguage)) {
    return res.status(400).json({ message: 'Unsupported target language.' });
  }
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 40) {
    return res.status(400).json({ message: 'Provide between 1 and 40 text strings.' });
  }
  if (texts.some((item) => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    return res.status(400).json({ message: 'Each text must be a non-empty string of at most 500 characters.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: 'AI translation is not configured. Set OPENAI_API_KEY in the backend .env file.' });
  }

  try {
    const model = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.5';
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model,
        instructions: [
          'You are a professional software UI localization translator.',
          `Translate each supplied UI string into ${LANGUAGE_NAMES[targetLanguage]}.`,
          'Return only a valid JSON object with one property named "translations", an array of strings in exactly the same order and length as the input.',
          'Keep product names such as ASEMS, Ambo University, personal names, identifiers, numbers, URLs, keyboard shortcuts, and placeholders such as {count}, {{name}}, %s, and :id unchanged.',
          'Use natural, concise, respectful wording suitable for a university staff evaluation management system.',
          'Do not explain the translation and do not add or remove array items.',
        ].join(' '),
        input: JSON.stringify({ texts }),
        text: { format: { type: 'json_object' } },
        max_output_tokens: Math.min(5000, Math.max(500, texts.join(' ').length * 3)),
        store: false,
      }),
    });

    const payload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      console.error('AI translation provider returned an error.', {
        status: apiResponse.status,
        message: payload?.error?.message,
      });
      return res.status(502).json({ message: 'AI translation provider could not complete the request.' });
    }

    const outputText = payload.output_text || payload.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === 'output_text')?.text;
    if (!outputText) {
      return res.status(502).json({ message: 'AI translation returned an empty response.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return res.status(502).json({ message: 'AI translation returned an invalid response.' });
    }

    if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length
      || parsed.translations.some((item) => typeof item !== 'string' || !item.trim())) {
      return res.status(502).json({ message: 'AI translation returned an incomplete result.' });
    }

    return res.json({ translations: parsed.translations.map((item) => item.trim()) });
  } catch (error) {
    console.error('AI translation request failed.', { message: error.message });
    return res.status(502).json({ message: 'AI translation service is temporarily unavailable.' });
  }
});

export default router;
