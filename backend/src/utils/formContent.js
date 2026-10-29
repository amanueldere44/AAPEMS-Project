import { z } from 'zod';

// Shape of the editable content of a DRAFT form version.
export const draftContentSchema = z.object({
  instructions: z.string().trim().max(5000).nullable().optional(),
  allowNa: z.boolean().optional(),
  sections: z
    .array(
      z.object({
        sectionKey: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .regex(/^[A-Za-z0-9_-]+$/, 'Section keys may only contain letters, digits, "_" and "-".'),
        title: z.string().trim().min(1).max(255),
        criteria: z
          .array(z.object({ text: z.string().trim().min(1).max(600) }))
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(30),
});

// Rules that Zod cannot express. Returns a list of human-readable problems (empty when valid).
export function findContentProblems(sections) {
  const problems = [];
  const keys = new Set();

  sections.forEach((section, index) => {
    const key = section.sectionKey.toLowerCase();
    if (keys.has(key)) problems.push(`Section key "${section.sectionKey}" is used more than once.`);
    keys.add(key);
    if (section.criteria.length === 0) problems.push(`Section ${index + 1} has no criteria.`);
  });

  return problems;
}

// Official forms use 5, 4, 3, 2, 1, 0 and NA.
export function buildRatingScale({ scaleMin, scaleMax, allowNa }) {
  const scale = [];
  for (let value = scaleMax; value >= scaleMin; value -= 1) scale.push(value);
  if (allowNa) scale.push('NA');
  return scale;
}

// Returns an error message when the score is not allowed on this version, otherwise null.
export function scoreProblem(score, { scale_min: min, scale_max: max, allow_na: allowNa }) {
  if (score === 'NA') return Number(allowNa) === 1 ? null : 'NA is not permitted on this form.';
  if (score < Number(min) || score > Number(max)) {
    return `Scores must be between ${Number(min)} and ${Number(max)}.`;
  }
  return null;
}