import { DoctorApiError } from "../api/client";
import {
  AuthTokens,
  DoctorIdentity,
  LoginResult,
  UserProfile,
} from "../types/auth";
import { E164 } from "../utils/phone";

export interface DoctorAuthApi {
  sendOtp(phone: string): Promise<{ message: string }>;
  verifyOtp(phone: string, otp: string): Promise<LoginResult>;
  currentUser(): Promise<UserProfile>;
  currentDoctor(): Promise<DoctorIdentity>;
  revokeSession(): Promise<void>;
  setTransientTokens(tokens: AuthTokens | null): void;
  persistTransientSession(): Promise<void>;
}

export interface TokenStore {
  load(): Promise<AuthTokens | null>;
  get(): AuthTokens | null;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

/**
 * What a signed-in account may do in this app:
 *  - doctor:    a verified, linked, non-demo doctor profile. The ONLY kind that reaches the dashboard.
 *  - demo:      the local-development demo doctor. Only accepted in a development build AND when the server
 *               itself reports the account as a demo account (the server refuses that outside development).
 *  - applicant: a regular account (no doctor role). It can register as a doctor and track its application,
 *               and nothing else. It is never granted doctor access.
 */
export type VerifiedSession =
  | { kind: "doctor"; user: UserProfile; doctor: DoctorIdentity }
  | { kind: "demo"; user: UserProfile; doctor: DoctorIdentity }
  | { kind: "applicant"; user: UserProfile };

export type RestoreResult =
  | { status: "signedOut" }
  | { status: "authenticated"; session: VerifiedSession }
  | { status: "unavailable"; message: string }
  | { status: "rejected"; message: string };

export interface AuthManagerOptions {
  /** Demo sessions are accepted only in development builds. Production builds always pass false. */
  allowDemo?: boolean;
}

const isDevBuild = (): boolean =>
  typeof __DEV__ !== "undefined" && __DEV__ === true;

export class DoctorAuthManager {
  private readonly allowDemo: boolean;

  constructor(
    private readonly api: DoctorAuthApi,
    private readonly tokens: TokenStore,
    options: AuthManagerOptions = {},
  ) {
    this.allowDemo = options.allowDemo ?? isDevBuild();
  }

  async requestOtp(phone: string): Promise<{ message: string }> {
    if (!E164.test(phone))
      throw new DoctorApiError(
        "Enter a valid phone number including country code.",
      );
    return this.api.sendOtp(phone);
  }

  async verifyOtp(phone: string, otp: string): Promise<VerifiedSession> {
    if (!E164.test(phone))
      throw new DoctorApiError(
        "Enter a valid phone number including country code.",
      );
    if (!/^\d{6}$/.test(otp))
      throw new DoctorApiError("Enter the 6-digit verification code.");
    const result = await this.api.verifyOtp(phone, otp);
    this.api.setTransientTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    try {
      // The role in the login response is only a first filter; the session is built from the server's own
      // /users/me and /doctors/me answers, never from what the login response claims.
      const session = await this.loadSession(result.user.id);
      await this.api.persistTransientSession();
      return session;
    } catch (error) {
      await this.revokeCandidateAndClear();
      throw error;
    }
  }

  async restore(): Promise<RestoreResult> {
    let saved: AuthTokens | null;
    try {
      saved = await this.tokens.load();
    } catch {
      await this.safeClear();
      return { status: "signedOut" };
    }
    if (!saved) return { status: "signedOut" };
    try {
      return { status: "authenticated", session: await this.loadSession() };
    } catch (error) {
      if (isUnauthorized(error)) {
        await this.rejectSession();
        return { status: "signedOut" };
      }
      if (
        error instanceof DoctorApiError &&
        error.code === "DOCTOR_ACCESS_REQUIRED"
      ) {
        await this.rejectSession();
        return {
          status: "rejected",
          message: "This account is not authorized to use the Doctor App.",
        };
      }
      if (isIdentityRejection(error)) {
        await this.rejectSession();
        return {
          status: "rejected",
          message:
            "A verified, linked doctor profile could not be confirmed. Contact support.",
        };
      }
      // Keep stored credentials on network/server failure but do not expose any screens.
      return {
        status: "unavailable",
        message:
          "We could not verify your account. Check your connection and retry.",
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.revokeSession();
    } catch {
      /* Local logout must still complete. */
    }
    this.api.setTransientTokens(null);
    await this.safeClear();
  }

  async revokeCandidateAndClear(): Promise<void> {
    try {
      await this.api.revokeSession();
    } catch {
      /* Best-effort server revocation. */
    }
    this.api.setTransientTokens(null);
    await this.safeClear();
  }

  private async rejectSession(): Promise<void> {
    try {
      await this.api.revokeSession();
    } catch {
      /* Invalid sessions still clear locally. */
    }
    this.api.setTransientTokens(null);
    await this.safeClear();
  }

  private async safeClear(): Promise<void> {
    try {
      await this.tokens.clear();
    } catch {
      /* Do not let keystore cleanup block auth flow. */
    }
  }

  private async loadSession(expectedUserId?: string): Promise<VerifiedSession> {
    const user = await this.api.currentUser();
    if ((expectedUserId && user.id !== expectedUserId) || !user.isActive) {
      throw new DoctorApiError(
        "This account is not authorized to use the Doctor App.",
        403,
        "DOCTOR_ACCESS_REQUIRED",
      );
    }
    if (user.role === "patient") {
      // An ordinary account: it may only register as a doctor and follow its application.
      return { kind: "applicant", user };
    }
    if (user.role !== "doctor" || !user.isVerified) {
      throw new DoctorApiError(
        "This account is not an authorized, verified doctor account.",
        403,
        "DOCTOR_ACCESS_REQUIRED",
      );
    }
    const doctor = await this.api.currentDoctor();
    if (doctor.isDemoAccount) {
      if (!this.allowDemo || !isValidDemoIdentity(doctor, user.id)) {
        throw new DoctorApiError(
          "Demo accounts are only available in local development builds.",
          403,
          "DOCTOR_ACCESS_REQUIRED",
        );
      }
      return { kind: "demo", user, doctor };
    }
    if (!isValidDoctorIdentity(doctor, user.id)) {
      throw new DoctorApiError(
        "A verified, linked, non-demo doctor profile is required.",
        403,
        "DOCTOR_PROFILE_REQUIRED",
      );
    }
    return { kind: "doctor", user, doctor };
  }
}

export function isValidDoctorIdentity(
  doctor: DoctorIdentity,
  expectedUserId: string,
): boolean {
  return Boolean(
    doctor.id &&
    doctor.userId === expectedUserId &&
    doctor.name &&
    doctor.specialization &&
    doctor.isVerified === true &&
    doctor.isDemo === false &&
    doctor.isStagingFixture === false &&
    doctor.isDemoAccount !== true &&
    doctor.licenseStatus === "provided" &&
    doctor.verification?.status === "verified",
  );
}

/** A demo identity must be explicitly flagged by the server and must claim no verification at all. */
export function isValidDemoIdentity(
  doctor: DoctorIdentity,
  expectedUserId: string,
): boolean {
  return Boolean(
    doctor.id &&
    doctor.userId === expectedUserId &&
    doctor.name &&
    doctor.isDemoAccount === true &&
    doctor.isVerified === false &&
    doctor.isDemo === true &&
    doctor.isStagingFixture === false &&
    doctor.verification?.status !== "verified",
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DoctorApiError && error.isUnauthorized;
}

function isIdentityRejection(error: unknown): boolean {
  return (
    error instanceof DoctorApiError &&
    (error.status === 403 || error.status === 404)
  );
}
