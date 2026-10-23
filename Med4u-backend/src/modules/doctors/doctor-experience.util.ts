export type ExperienceBasis = 'career_start' | 'stated' | 'demo';

export interface ExperienceInput {
  isDemo: boolean;
  experienceYears?: number | null;
  careerStartYear?: number | null;
  experienceSource?: string | null;
}

/**
 * Years of experience to show, and why we believe it.
 *  - career start year known: computed from it (never goes stale);
 *  - a stated value that carries its source: shown with that source;
 *  - demo profiles: the illustrative seeded value;
 *  - anything else: null ("Not provided"). A bare stored 0 is never shown as real experience.
 */
export function resolveExperience(
  d: ExperienceInput,
  now: Date = new Date(),
): { years: number | null; basis: ExperienceBasis | null } {
  if (d.careerStartYear) {
    return { years: Math.max(0, now.getUTCFullYear() - d.careerStartYear), basis: 'career_start' };
  }
  if (!d.isDemo && d.experienceYears != null && d.experienceSource) {
    return { years: d.experienceYears, basis: 'stated' };
  }
  if (d.isDemo && d.experienceYears != null) {
    return { years: d.experienceYears, basis: 'demo' };
  }
  return { years: null, basis: null };
}
