import { useEffect, useState } from 'react';
import { LANGUAGE_OPTIONS, translations } from './translations.js';

const STORAGE_KEY = 'asems-language';
const AI_CACHE_KEY = 'asems-ai-translation-cache-v1';
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
const pendingByLanguage = new Map();
const inFlightByLanguage = new Map();
const attemptedByLanguage = new Map();

function getLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) return saved;
  } catch {
    // Continue in English when browser storage is unavailable.
  }
  return 'en';
}

function translateText(source, dictionary) {
  if (Object.prototype.hasOwnProperty.call(dictionary, source)) return dictionary[source];

  // Translate known count-based sentences while preserving the live count.
  for (const [pattern, translatedPattern] of Object.entries(dictionary)) {
    if (!pattern.includes('{count}')) continue;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{count\\}', '(\\d+)');
    const match = source.match(new RegExp(`^${escaped}$`));
    if (match) return translatedPattern.replace('{count}', match[1]);
  }

  return undefined;
}

function readAICache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAICache(cache) {
  try {
    localStorage.setItem(AI_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Translation still works for the current session if storage is full/disabled.
  }
}

function shouldSkipAI(node) {
  const parent = node?.parentElement;
  if (!parent) return true;
  // Preserve user-specific database content such as names and evaluation-cycle titles.
  if (parent.closest('script,style,textarea,[data-no-translate],td,[contenteditable="true"]')) return true;
  const source = node.nodeValue?.trim() || '';
  if (!source || source.length > 500) return true;
  if (/^[\d\s.,/%+$#@()_-]+$/.test(source)) return true;
  return false;
}

function getAITranslation(language, source) {
  const cache = readAICache();
  return cache?.[language]?.[source];
}

async function requestAITranslations(language, texts) {
  const uniqueTexts = [...new Set(texts)].filter((text) => text && !getAITranslation(language, text));
  if (!uniqueTexts.length) return false;

  let inFlight = inFlightByLanguage.get(language);
  if (!inFlight) {
    inFlight = new Set();
    inFlightByLanguage.set(language, inFlight);
  }
  let attempted = attemptedByLanguage.get(language);
  if (!attempted) { attempted = new Set(); attemptedByLanguage.set(language, attempted); }
  const freshTexts = uniqueTexts.filter((text) => !inFlight.has(text) && !attempted.has(text));
  if (!freshTexts.length) return false;
  freshTexts.forEach((text) => { inFlight.add(text); attempted.add(text); });
  let didTranslate = false;

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    // Keep batches small and bounded; the server owns the API key.
    for (let offset = 0; offset < freshTexts.length; offset += 40) {
      const batch = freshTexts.slice(offset, offset + 40);
      let token = '';
      try { token = sessionStorage.getItem('asems_token') || ''; } catch { /* Auth storage may be unavailable. */ }
      const response = await fetch(`${apiBase}/translation/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetLanguage: language, texts: batch }),
      });
      if (!response.ok) continue;
      const result = await response.json();
      if (!Array.isArray(result.translations)) continue;
      const cache = readAICache();
      cache[language] ||= {};
      batch.forEach((source, index) => {
        const translated = result.translations[index];
        if (typeof translated === 'string' && translated.trim()) {
          cache[language][source] = translated.trim();
          didTranslate = true;
        }
      });
      writeAICache(cache);
    }
  } catch {
    // If AI is not configured or the API is unavailable, existing dictionary translations remain usable.
  } finally {
    freshTexts.forEach((text) => inFlight.delete(text));
  }
  return didTranslate;
}

function translatePage(language) {
  const dictionary = translations[language] || {};
  const aiCandidates = new Set();
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,textarea,[data-no-translate]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node;
  while ((node = walker.nextNode())) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const trimmed = source.trim();
    let translated = translateText(trimmed, dictionary);
    if (!translated && language !== 'en' && !shouldSkipAI(node)) {
      translated = getAITranslation(language, trimmed);
      if (!translated) aiCandidates.add(trimmed);
    }
    if (translated && node.nodeValue !== source.replace(trimmed, translated)) {
      node.nodeValue = source.replace(trimmed, translated);
    } else if (!translated && language === 'en' && node.nodeValue !== source) {
      node.nodeValue = source;
    }
  }

  const attributeNames = ['placeholder', 'aria-label', 'title', 'aria-description'];
  document.querySelectorAll('input,button,a,[title],[aria-label],[aria-description]').forEach((element) => {
    let cache = originalAttributes.get(element);
    if (!cache) {
      cache = {};
      originalAttributes.set(element, cache);
    }
    attributeNames.forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      if (!(attribute in cache)) cache[attribute] = element.getAttribute(attribute);
      const source = cache[attribute];
      const translated = translateText(source, dictionary) || (language !== 'en' ? getAITranslation(language, source) : undefined);
      if (!translated && language !== 'en' && source.trim().length <= 200) aiCandidates.add(source);
      if (translated && element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
      else if (!translated && language === 'en' && element.getAttribute(attribute) !== source) element.setAttribute(attribute, source);
    });
  });

  if (language !== 'en' && aiCandidates.size) {
    const existing = pendingByLanguage.get(language);
    if (existing) {
      aiCandidates.forEach((text) => existing.texts.add(text));
    } else {
      const state = { texts: aiCandidates, scheduled: false };
      pendingByLanguage.set(language, state);
      state.scheduled = true;
      queueMicrotask(async () => {
        const current = pendingByLanguage.get(language);
        if (!current) return;
        pendingByLanguage.delete(language);
        const didTranslate = await requestAITranslations(language, [...current.texts]);
        if (didTranslate) translatePage(language);
      });
    }
  }
}

export function useLanguage() {
  const [language, setLanguage] = useState(getLanguage);

  useEffect(() => {
    const apply = () => translatePage(language);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'aria-label', 'title', 'aria-description'],
    });
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The current selection remains active for this page.
    }
    return () => observer.disconnect();
  }, [language]);

  return { language, setLanguage };
}

export function LanguageSwitcher({ compact = false }) {
  const { language, setLanguage } = useLanguage();
  return (
    <label className={`asems-language-control ${compact ? 'asems-language-control-compact' : ''}`}>
      <span className="sr-only">Choose language</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label="Choose language"
        title="Choose language"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
