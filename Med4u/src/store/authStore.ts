import { create } from "zustand";
import { setSessionExpiredHandler } from "../services/api/client";
import { toApiError } from "../services/api/errors";
import { authService } from "../services/auth.service";
import { userService } from "../services/user.service";
import { tokenStorage } from "../services/tokenStorage";
import { AuthUser } from "../types/auth";
import { useOnboardingStore } from "./onboardingStore";
import { useUserStore } from "./userStore";
import * as SecureStore from "expo-secure-store";
import { pushTokenService } from "../services/push-token.service";

const LOGOUT_TIMEOUT_MS = 5_000;

interface AuthState {
  /** True until the stored session has been checked at startup. */
  isRestoring: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  /**
   * True while the signed-in account must finish (or has just finished, but not yet left) onboarding.
   * Derived from the backend's profile-completion flag, never from local storage.
   */
  needsOnboarding: boolean;
  /** E.164 number an OTP was last requested for. */
  phone: string;
  isLoading: boolean;
  error: string | null;
  restoreSession: () => Promise<void>;
  /** Replaces the cached user, e.g. after the profile was fetched or edited. */
  setUser: (user: AuthUser) => void;
  /** Leaves onboarding for Home; call only after the backend confirmed the profile is complete. */
  completeOnboarding: () => void;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
}

const signedOut = {
  isAuthenticated: false,
  user: null,
  needsOnboarding: false,
  phone: "",
  isLoading: false,
  error: null,
} as const;

export const useAuthStore = create<AuthState>((set, get) => ({
  ...signedOut,
  isRestoring: true,

  restoreSession: async () => {
    try {
      const tokens = await tokenStorage.load();
      if (!tokens) {
        set({ isRestoring: false });
        return;
      }
      try {
        // Doubles as session validation: a 401 triggers the client's refresh flow.
        const user = await userService.getProfile();
        set({
          isAuthenticated: true,
          user,
          needsOnboarding: user.isProfileComplete === false,
          isRestoring: false,
        });
      } catch (error) {
        if (toApiError(error).isUnauthorized) {
          // Access and refresh tokens were both rejected.
          await tokenStorage.clear();
          set({ ...signedOut, isRestoring: false });
        } else {
          // Offline or server trouble: the tokens may still be valid, so keep the session.
          set({ isAuthenticated: true, isRestoring: false });
        }
      }
    } catch {
      // Keystore unreadable: fall back to a fresh login.
      set({ ...signedOut, isRestoring: false });
    }
  },

  setUser: (user) => set({ user }),

  completeOnboarding: () => {
    useOnboardingStore.getState().reset();
    set({ needsOnboarding: false });
  },

  requestOtp: async (phone) => {
    if (get().isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await authService.requestOtp(phone);
      set({ phone, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: toApiError(error).message });
      throw error;
    }
  },

  verifyOtp: async (phone, otp) => {
    if (get().isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { accessToken, refreshToken, user, isProfileComplete } = await authService.verifyOtp(phone, otp);
      // Persist before flipping auth state so a keystore failure never yields a session
      // that would vanish on the next launch.
      await tokenStorage.save({ accessToken, refreshToken });
      set({
        isAuthenticated: true,
        user,
        needsOnboarding: !isProfileComplete,
        phone: "",
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: toApiError(error).message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  logout: async () => {
    try {
      const deviceId = await SecureStore.getItemAsync("med4u.push.device-id");
      if (deviceId) await pushTokenService.remove(deviceId);
    } catch { /* Signing out remains possible offline; a later account registration reassigns the device token. */ }
    try {
      // Best effort: revoke server-side sessions, but never let it block signing out.
      await authService.logout({ timeout: LOGOUT_TIMEOUT_MS });
    } catch {
      // Ignored on purpose; local credentials are removed below regardless.
    }
    try {
      await tokenStorage.clear();
    } finally {
      useUserStore.getState().resetUserData();
      useOnboardingStore.getState().reset();
      set({ ...signedOut, isRestoring: false });
    }
  },
}));

// If a token refresh is rejected mid-session, drop back to the login flow.
setSessionExpiredHandler(() => {
  useUserStore.getState().resetUserData();
  useOnboardingStore.getState().reset();
  useAuthStore.setState({ ...signedOut, isRestoring: false });
});
