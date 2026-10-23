import { AuthUser, UpdateProfileRequest } from "../types/auth";
import { api } from "./api/client";

export const userService = {
  /** The backend is the source of truth for the signed-in user's profile. */
  getProfile(): Promise<AuthUser> {
    return api.get<AuthUser>("/v1/users/me");
  },

  updateProfile(changes: UpdateProfileRequest): Promise<AuthUser> {
    return api.patch<AuthUser>("/v1/users/me", changes);
  },
};
