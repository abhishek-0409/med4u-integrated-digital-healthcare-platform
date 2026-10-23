import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DoctorAuthManager, RestoreResult, VerifiedSession } from "./authManager";
import { doctorApi, toDoctorApiError } from "../api/client";
import { authApi } from "../services/authApi";
import { tokenStorage } from "../services/tokenStorage";

type AuthStatus = "restoring" | "signedOut" | "otpPending" | "working" | "authenticated" | "applicant" | "unavailable" | "rejected";
interface AuthContextValue {
  status: AuthStatus;
  session: VerifiedSession | null;
  /** True for the local-development demo doctor. Synthetic data only. */
  isDemo: boolean;
  phone: string;
  error: string | null;
  working: boolean;
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, otp: string): Promise<void>;
  clearError(): void;
  retryRestore(): Promise<void>;
  logout(): Promise<void>;
}

const manager = new DoctorAuthManager(authApi, tokenStorage);
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [session, setSession] = useState<VerifiedSession | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const restore = async () => {
    setStatus("restoring");
    setError(null);
    const result: RestoreResult = await manager.restore();
    applyRestore(result);
  };
  const applyRestore = (result: RestoreResult) => {
    if (result.status === "authenticated") { setSession(result.session); setStatus(result.session.kind === "applicant" ? "applicant" : "authenticated"); }
    else if (result.status === "unavailable") { setSession(null); setStatus("unavailable"); setError(result.message); }
    else if (result.status === "rejected") { setSession(null); setStatus("rejected"); setError(result.message); }
    else { setSession(null); setStatus("signedOut"); }
  };

  useEffect(() => {
    doctorApi.setSessionExpiredHandler(() => {
      setSession(null);
      setError("Your session expired. Sign in again.");
      setStatus("signedOut");
    });
    void restore();
    return () => doctorApi.setSessionExpiredHandler(null);
  }, []);

  const requestOtp = async (value: string) => {
    setWorking(true); setError(null);
    try {
      await manager.requestOtp(value);
      setPhone(value); setStatus("otpPending");
    } catch (e) {
      setError(toDoctorApiError(e).message);
      throw e;
    } finally { setWorking(false); }
  };
  const verifyOtp = async (value: string, otp: string) => {
    setWorking(true); setError(null); setStatus("working");
    try {
      const verified = await manager.verifyOtp(value, otp);
      setSession(verified); setPhone(""); setStatus(verified.kind === "applicant" ? "applicant" : "authenticated");
    } catch (e) {
      const apiError = toDoctorApiError(e);
      const message = apiError.code === "OTP_EXPIRED"
        ? "That code has expired. Request a new one."
        : apiError.code === "DOCTOR_ACCESS_REQUIRED" || apiError.status === 403
          ? "This account is not authorized to use the Doctor App."
          : apiError.code === "DOCTOR_PROFILE_REQUIRED" || apiError.status === 404
            ? "We could not confirm a verified doctor profile for this account. Contact support."
            : apiError.message;
      setError(message);
      setStatus("otpPending");
      throw e;
    } finally { setWorking(false); }
  };
  const logout = async () => {
    setWorking(true);
    try { await manager.logout(); }
    finally { setSession(null); setPhone(""); setError(null); setStatus("signedOut"); setWorking(false); }
  };
  const value = useMemo<AuthContextValue>(() => ({
    status, session, isDemo: session?.kind === "demo", phone, error, working, requestOtp, verifyOtp,
    clearError: () => setError(null),
    retryRestore: restore,
    logout,
  }), [status, session, phone, error, working]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
