import { create } from "zustand";
import { AuthUser, BloodGroup, Gender } from "../types/auth";
import { isoToDobInput } from "../utils/profileForm";

/**
 * Onboarding form drafts, held in memory only. Health details are sensitive, so nothing here is
 * written to AsyncStorage or SecureStore; the backend profile is what survives an app restart.
 * Keeping the draft in a store (not component state) means going back never discards input and a
 * failed request never erases it.
 */
interface OnboardingDraft {
  /** Account the draft was seeded for, so a different login never sees another user's draft. */
  seededFor: string | null;
  name: string;
  email: string;
  /** DD/MM/YYYY as typed. */
  dob: string;
  bloodGroup: BloodGroup | null;
  gender: Gender | null;
  height: string;
  weight: string;
}

interface OnboardingState extends OnboardingDraft {
  seed: (user: AuthUser) => void;
  setField: <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;
  reset: () => void;
}

const empty: OnboardingDraft = {
  seededFor: null,
  name: "",
  email: "",
  dob: "",
  bloodGroup: null,
  gender: null,
  height: "",
  weight: "",
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...empty,

  seed: (user) => {
    if (get().seededFor === user.id) {
      return; // keep what the user already typed
    }
    set({
      seededFor: user.id,
      // A new account has its phone number as a placeholder name; don't present that as theirs.
      name: user.name && user.name !== user.phone ? user.name : "",
      email: user.email ?? "",
      dob: isoToDobInput(user.dob),
      bloodGroup: user.bloodGroup ?? null,
      gender: user.gender ?? null,
      height: user.heightCm != null ? String(user.heightCm) : "",
      weight: user.weightKg != null ? String(user.weightKg) : "",
    });
  },

  setField: (key, value) => set({ [key]: value } as Partial<OnboardingDraft>),

  reset: () => set({ ...empty }),
}));
