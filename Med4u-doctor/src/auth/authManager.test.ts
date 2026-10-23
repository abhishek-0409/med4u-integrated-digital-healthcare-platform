import { DoctorAuthManager, DoctorAuthApi, TokenStore } from "./authManager";
import {
  AuthTokens,
  DoctorIdentity,
  LoginResult,
  UserProfile,
} from "../types/auth";
import { DoctorApiError } from "../api/client";

const tokens: AuthTokens = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
};
const login: LoginResult = {
  ...tokens,
  user: {
    id: "user-1",
    phone: "+919876543210",
    name: "Dr Example",
    email: null,
    avatarUrl: null,
    role: "doctor",
    isVerified: true,
  },
  isNewUser: false,
  isProfileComplete: true,
};
const user: UserProfile = {
  ...login.user,
  dob: null,
  gender: null,
  bloodGroup: null,
  heightCm: null,
  weightKg: null,
  isProfileComplete: true,
  isActive: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
const doctor: DoctorIdentity = {
  id: "doctor-1",
  userId: "user-1",
  name: "Dr Example",
  specialization: "Cardiology",
  isVerified: true,
  isDemo: false,
  isStagingFixture: false,
  licenseStatus: "provided",
  registrationStatus: "provided",
  verification: { status: "verified" },
  availabilitySchedule: {},
};
const demoDoctor: DoctorIdentity = {
  id: "doctor-demo",
  userId: "user-1",
  name: "DEMO Doctor (Local Video Test)",
  specialization: "General Medicine",
  isVerified: false,
  isDemo: true,
  isStagingFixture: false,
  isDemoAccount: true,
  licenseStatus: "provided",
  registrationStatus: "not_provided",
  verification: { status: "unverified" },
  availabilitySchedule: {},
};
const asPatient = (u: UserProfile): UserProfile => ({
  ...u,
  role: "patient",
  isVerified: true,
});

function fixture(
  overrides: Partial<DoctorAuthApi> = {},
  options?: { allowDemo?: boolean },
) {
  let stored: AuthTokens | null = null;
  let candidate: AuthTokens | null = null;
  const storage: TokenStore = {
    load: async () => stored,
    get: () => stored,
    save: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
  const api: DoctorAuthApi = {
    sendOtp: jest.fn(async () => ({ message: "OTP sent" })),
    verifyOtp: jest.fn(async () => login),
    currentUser: jest.fn(async () => user),
    currentDoctor: jest.fn(async () => doctor),
    revokeSession: jest.fn(async () => undefined),
    setTransientTokens: jest.fn((value) => {
      candidate = value;
    }),
    persistTransientSession: jest.fn(async () => {
      if (candidate) stored = candidate;
      candidate = null;
    }),
    ...overrides,
  };
  return {
    manager: new DoctorAuthManager(api, storage, options),
    api,
    storage,
    getStored: () => stored,
  };
}

describe("DoctorAuthManager", () => {
  it("requests OTP using the backend E.164 phone contract", async () => {
    const { manager, api } = fixture();
    await manager.requestOtp("+919876543210");
    expect(api.sendOtp).toHaveBeenCalledWith("+919876543210");
    await expect(manager.requestOtp("98765")).rejects.toThrow("country code");
  });

  it("verifies the OTP and persists tokens only after doctor identity validation", async () => {
    const { manager, api, getStored } = fixture();
    const session = await manager.verifyOtp("+919876543210", "123456");
    expect(api.verifyOtp).toHaveBeenCalledWith("+919876543210", "123456");
    expect(api.currentUser).toHaveBeenCalled();
    expect(api.currentDoctor).toHaveBeenCalled();
    expect(getStored()).toEqual(tokens);
    expect(session.kind).toBe("doctor");
    if (session.kind === "doctor") expect(session.doctor.id).toBe("doctor-1");
  });

  describe("accounts without a doctor role are never granted doctor access", () => {
    it("a patient becomes an applicant: tokens persisted, doctor profile never requested", async () => {
      const { manager, api, getStored } = fixture({
        verifyOtp: jest.fn(async () => ({
          ...login,
          user: { ...login.user, role: "patient" as const },
        })),
        currentUser: jest.fn(async () => asPatient(user)),
      });
      const session = await manager.verifyOtp("+919876543210", "123456");
      expect(session.kind).toBe("applicant");
      expect(session).not.toHaveProperty("doctor");
      expect(api.currentDoctor).not.toHaveBeenCalled();
      expect(getStored()).toEqual(tokens);
    });

    it.each(["admin", "pharmacist"] as const)(
      "rejects a %s account and clears the candidate",
      async (role) => {
        const { manager, api, getStored } = fixture({
          verifyOtp: jest.fn(async () => ({
            ...login,
            user: { ...login.user, role },
          })),
          currentUser: jest.fn(async () => ({ ...user, role })),
        });
        await expect(
          manager.verifyOtp("+919876543210", "123456"),
        ).rejects.toThrow("not an authorized");
        expect(api.revokeSession).toHaveBeenCalled();
        expect(getStored()).toBeNull();
      },
    );

    it("trusts /users/me over the login response: a response claiming doctor for a patient is an applicant, not a doctor", async () => {
      const { manager } = fixture({
        currentUser: jest.fn(async () => asPatient(user)),
      });
      const session = await manager.verifyOtp("+919876543210", "123456");
      expect(session.kind).toBe("applicant");
    });

    it("rejects an inactive account", async () => {
      const { manager, getStored } = fixture({
        currentUser: jest.fn(async () => ({
          ...asPatient(user),
          isActive: false,
        })),
      });
      await expect(
        manager.verifyOtp("+919876543210", "123456"),
      ).rejects.toThrow("not authorized");
      expect(getStored()).toBeNull();
    });
  });

  it("rejects unlinked, demo-flagged seed, or unverified profiles without persisting tokens", async () => {
    const { manager, getStored, api } = fixture({
      currentDoctor: jest.fn(async () => ({ ...doctor, isDemo: true })),
    });
    await expect(manager.verifyOtp("+919876543210", "123456")).rejects.toThrow(
      "non-demo",
    );
    expect(api.persistTransientSession).not.toHaveBeenCalled();
    expect(getStored()).toBeNull();
  });

  it("rejects an unlinked doctor when the self-profile lookup returns not found", async () => {
    const { manager, api, getStored } = fixture({
      currentDoctor: jest.fn(async () => {
        throw new DoctorApiError("Not found", 404);
      }),
    });
    await expect(manager.verifyOtp("+919876543210", "123456")).rejects.toThrow(
      "Not found",
    );
    expect(api.revokeSession).toHaveBeenCalled();
    expect(api.persistTransientSession).not.toHaveBeenCalled();
    expect(getStored()).toBeNull();
  });

  describe("demo doctor (development only)", () => {
    it("is accepted in a development build when the server flags it as a demo account", async () => {
      const { manager } = fixture(
        { currentDoctor: jest.fn(async () => demoDoctor) },
        { allowDemo: true },
      );
      const session = await manager.verifyOtp("+911111111112", "123456");
      expect(session.kind).toBe("demo");
    });

    it("is refused in a production build even if the server says it is a demo account", async () => {
      const { manager, getStored } = fixture(
        { currentDoctor: jest.fn(async () => demoDoctor) },
        { allowDemo: false },
      );
      await expect(
        manager.verifyOtp("+911111111112", "123456"),
      ).rejects.toThrow("local development");
      expect(getStored()).toBeNull();
    });

    it("is refused when the demo profile claims to be verified or is not flagged by the server", async () => {
      for (const forged of [
        { ...demoDoctor, isVerified: true },
        { ...demoDoctor, verification: { status: "verified" as const } },
        { ...demoDoctor, isStagingFixture: true },
      ]) {
        const { manager, getStored } = fixture(
          { currentDoctor: jest.fn(async () => forged) },
          { allowDemo: true },
        );
        await expect(
          manager.verifyOtp("+911111111112", "123456"),
        ).rejects.toBeInstanceOf(DoctorApiError);
        expect(getStored()).toBeNull();
      }
      // An unverified, unflagged profile is simply not a doctor.
      const { manager } = fixture(
        {
          currentDoctor: jest.fn(async () => ({
            ...demoDoctor,
            isDemoAccount: false,
          })),
        },
        { allowDemo: true },
      );
      await expect(
        manager.verifyOtp("+911111111112", "123456"),
      ).rejects.toThrow("non-demo");
    });

    it("a real doctor profile may not also claim to be a demo account", async () => {
      const { manager } = fixture(
        {
          currentDoctor: jest.fn(async () => ({
            ...doctor,
            isDemoAccount: true,
          })),
        },
        { allowDemo: false },
      );
      await expect(
        manager.verifyOtp("+919876543210", "123456"),
      ).rejects.toThrow("local development");
    });
  });

  it("restores only a verified doctor session", async () => {
    const f = fixture();
    await f.storage.save(tokens);
    await expect(f.manager.restore()).resolves.toEqual({
      status: "authenticated",
      session: { kind: "doctor", user, doctor },
    });
  });

  it("restores a patient as an applicant (application screens only), keeping tokens", async () => {
    const f = fixture({ currentUser: jest.fn(async () => asPatient(user)) });
    await f.storage.save(tokens);
    const result = await f.manager.restore();
    expect(result).toMatchObject({
      status: "authenticated",
      session: { kind: "applicant" },
    });
    expect(f.api.currentDoctor).not.toHaveBeenCalled();
    expect(f.getStored()).toEqual(tokens);
  });

  it("clears a restored admin session", async () => {
    const f = fixture({
      currentUser: jest.fn(async () => ({
        ...user,
        role: "admin" as UserProfile["role"],
      })),
    });
    await f.storage.save(tokens);
    await expect(f.manager.restore()).resolves.toMatchObject({
      status: "rejected",
    });
    expect(f.getStored()).toBeNull();
  });

  it("restores a once-pending applicant as a doctor after approval", async () => {
    let approved = false;
    const f = fixture({
      currentUser: jest.fn(async () => (approved ? user : asPatient(user))),
    });
    await f.storage.save(tokens);
    expect(await f.manager.restore()).toMatchObject({
      session: { kind: "applicant" },
    });
    approved = true;
    expect(await f.manager.restore()).toMatchObject({
      session: { kind: "doctor" },
    });
  });

  it("preserves tokens but grants no session when identity check is offline", async () => {
    const f = fixture({
      currentUser: jest.fn(async () => {
        throw new Error("offline");
      }),
    });
    await f.storage.save(tokens);
    await expect(f.manager.restore()).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(f.getStored()).toEqual(tokens);
  });

  it("revokes remotely and clears local tokens on logout", async () => {
    const f = fixture();
    await f.storage.save(tokens);
    await f.manager.logout();
    expect(f.api.revokeSession).toHaveBeenCalled();
    expect(f.getStored()).toBeNull();
  });
});
