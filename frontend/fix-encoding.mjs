// One-time repair of garbled characters (UTF-8 text that was decoded as Windows-1252).
// ASCII-only source: every character is written as a \u escape.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'src/pages/LeadershipEvaluationsPage.jsx',
  'src/pages/ArchivePage.jsx',
  'src/pages/OfficesPage.jsx',
  'src/pages/ReferralsPage.jsx',
];

const FIXES = [
  ['\u00e2\u20ac\u00a6', '\u2026'], // ellipsis
  ['\u00c2\u00b7', '\u00b7'],       // middle dot
  ['\u00e2\u20ac\u201d', '\u2014'], // em dash
  ['\u00e2\u20ac\u0153', '\u201c'], // left double quote
  ['\u00e2\u20ac\u009d', '\u201d'], // right double quote
  ['\u00e2\u2020\u2019', '\u2192'], // right arrow
];

for (const file of FILES) {
  const original = readFileSync(file, 'utf8');
  let text = original.replace(/^\uFEFF/, '');
  let replaced = 0;

  for (const [bad, good] of FIXES) {
    const parts = text.split(bad);
    replaced += parts.length - 1;
    text = parts.join(good);
  }

  const bomRemoved = text !== original && original.startsWith('\uFEFF');
  if (replaced > 0 || bomRemoved) {
    writeFileSync(file, text, 'utf8');
  }
  console.log(`${file}: ${replaced} fixed${bomRemoved ? ', BOM removed' : ''}`);
}