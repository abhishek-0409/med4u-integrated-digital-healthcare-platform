export type UserRole = "patient" | "doctor" | "admin" | "pharmacist";
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";

/**
 * The signed-in user. Login responses carry the core fields; GET /users/me adds the
 * profile details, so those are optional until the profile has been fetched.
 */
export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  isVerified: boolean;
  /** 'YYYY-MM-DD' */
  dob?: string | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  /** Optional, centimetres. */
  heightCm?: number | null;
  /** Optional, kilograms. */
  weightKg?: number | null;
  /** Computed by the backend (GET /users/me); absent on the login response's `user`. */
  isProfileComplete?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
  isNewUser: boolean;
  isProfileComplete: boolean;
}

/** Fields PATCH /users/me accepts. `null` clears an optional field. */
export interface UpdateProfileRequest {
  name?: string;
  email?: string | null;
  dob?: string | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  heightCm?: number | null;
  weightKg?: number | null;
}
