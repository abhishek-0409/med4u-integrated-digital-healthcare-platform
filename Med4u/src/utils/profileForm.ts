/** Pure helpers for the onboarding forms. The backend re-validates everything; these give fast feedback. */
import { BloodGroup, Gender } from "../types/auth";
import { ageFromDob, isValidPastDate } from "./helpers";

export const MAX_AGE_YEARS = 120;
export const HEIGHT_RANGE_CM = { min: 50, max: 250 } as const;
export const WEIGHT_RANGE_KG = { min: 2, max: 500 } as const;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BLOOD_GROUP_OPTIONS: Array<{ value: BloodGroup; label: string }> = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "unknown", label: "Unknown" },
];

export const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/** Keeps digits only and inserts slashes while typing: "1804" -> "18/04", "18041992" -> "18/04/1992". */
export const formatDobInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** 'DD/MM/YYYY' -> 'YYYY-MM-DD' (not validated), or null when the text is incomplete. */
export const dobInputToIso = (text: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' for display; empty string for anything else. */
export const isoToDobInput = (iso: string | null | undefined): string => {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

/** Returns an error message, or null when the DD/MM/YYYY text is a plausible birth date. */
export const validateDobInput = (text: string): string | null => {
  if (!text.trim()) return "Select your date of birth.";
  const iso = dobInputToIso(text);
  if (!iso || !isValidPastDate(iso)) return "Enter a valid date of birth as DD/MM/YYYY.";
  const age = ageFromDob(iso);
  if (age === null || age > MAX_AGE_YEARS) return "Enter a valid date of birth as DD/MM/YYYY.";
  return null;
};

/** "32 years" for a valid DD/MM/YYYY entry, otherwise null. */
export const ageLabelFromDobInput = (text: string): string | null => {
  const iso = dobInputToIso(text);
  if (!iso || validateDobInput(text)) return null;
  const age = ageFromDob(iso);
  if (age === null) return null;
  return age === 1 ? "1 year" : `${age} years`;
};

export interface BasicDetailsInput {
  name: string;
  email: string;
  dob: string;
}

export type BasicDetailsErrors = Partial<Record<keyof BasicDetailsInput, string>>;

export const validateBasicDetails = (input: BasicDetailsInput): BasicDetailsErrors => {
  const errors: BasicDetailsErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter your full name.";
  else if (name.length < 2 || name.length > 100) errors.name = "Name must be 2–100 characters.";

  const email = input.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 150 || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  const dobError = validateDobInput(input.dob);
  if (dobError) errors.dob = dobError;
  return errors;
};

/** Parses a decimal typed by the user ("165", "165.5", "165,5"); null when empty or not a number. */
export const parseDecimal = (text: string): number | null => {
  const normalised = text.trim().replace(",", ".");
  if (!normalised || !/^\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
};

const validateOptionalMeasure = (
  text: string,
  range: { min: number; max: number },
  label: string,
  unit: string,
): string | null => {
  if (!text.trim()) return null; // optional
  const value = parseDecimal(text);
  if (value === null) return `Enter ${label} as a number.`;
  if (value < range.min || value > range.max) return `${label[0].toUpperCase()}${label.slice(1)} must be between ${range.min} and ${range.max} ${unit}.`;
  if (Math.round(value * 10) / 10 !== value) return "Use at most one decimal place.";
  return null;
};

export const validateHeight = (text: string): string | null =>
  validateOptionalMeasure(text, HEIGHT_RANGE_CM, "height", "cm");

export const validateWeight = (text: string): string | null =>
  validateOptionalMeasure(text, WEIGHT_RANGE_KG, "weight", "kg");

/** First onboarding step that still lacks required data, from the backend-provided profile. */
export type OnboardingStep = "BasicDetails" | "HealthInfo" | "AccountReady";

export const firstIncompleteStep = (profile: {
  phone: string;
  name: string;
  email?: string | null;
  dob?: string | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
}): OnboardingStep => {
  const name = profile.name?.trim();
  if (!name || name === profile.phone || !profile.email || !profile.dob) return "BasicDetails";
  if (!profile.gender || !profile.bloodGroup) return "HealthInfo";
  return "AccountReady";
};
