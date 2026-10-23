export type UserRole = "patient" | "doctor" | "admin" | "pharmacist";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isVerified: boolean;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
  isNewUser: boolean;
  isProfileComplete: boolean;
}

export interface UserProfile extends AuthUser {
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  isProfileComplete: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/v1/doctors/me should return DoctorDetailResponse scoped to the JWT subject. */
export interface DoctorIdentity {
  id: string;
  userId: string;
  name: string;
  specialization: string;
  isVerified: boolean;
  isDemo: boolean;
  isStagingFixture: boolean;
  /** Local-development demo account (server only reports this in an enabled development run). */
  isDemoAccount?: boolean;
  licenseStatus: "provided" | "missing";
  registrationStatus: "provided" | "not_provided";
  verification: { status: "unverified" | "verified" | "rejected" };
  availabilitySchedule: Partial<Record<import("./appointment").ApiWeekday, import("./appointment").ApiDaySchedule>>;
}
