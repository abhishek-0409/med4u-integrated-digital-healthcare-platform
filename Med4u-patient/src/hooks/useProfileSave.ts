import { useCallback, useState } from "react";
import { toApiError } from "../services/api/errors";
import { userService } from "../services/user.service";
import { useAuthStore } from "../store/authStore";
import { AuthUser, UpdateProfileRequest } from "../types/auth";

export interface ProfileSaveFailure {
  message: string;
  /** Set when the server rejected the email because another account uses it. */
  emailTaken: boolean;
}

/**
 * Saves profile changes through the authenticated PATCH /users/me. Returns the profile the backend
 * confirmed, or null on failure (the failure is exposed as `failure`). Callers keep their form state,
 * so a failed request never loses what the user typed.
 */
export function useProfileSave() {
  const setUser = useAuthStore((state) => state.setUser);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ProfileSaveFailure | null>(null);

  const save = useCallback(
    async (changes: UpdateProfileRequest): Promise<AuthUser | null> => {
      setSaving(true);
      setFailure(null);
      try {
        const updated = await userService.updateProfile(changes);
        setUser(updated);
        return updated;
      } catch (error) {
        const apiError = toApiError(error);
        setFailure({ message: apiError.message, emailTaken: apiError.code === "EMAIL_TAKEN" });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [setUser],
  );

  const clearFailure = useCallback(() => setFailure(null), []);

  return { save, saving, failure, clearFailure };
}
