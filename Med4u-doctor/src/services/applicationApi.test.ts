import { DoctorApiError, doctorApi } from "../api/client";
import { statusGuidance } from "../screens/ApplicationScreen";
import { applicationApi, buildApplicationForm } from "./applicationApi";

describe("applicationApi", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns null when the account has not applied yet", async () => {
    jest.spyOn(doctorApi, "get").mockRejectedValue(new DoctorApiError("none", 404, "APPLICATION_NOT_FOUND"));
    await expect(applicationApi.getMine()).resolves.toBeNull();
  });

  it("surfaces every other failure", async () => {
    jest.spyOn(doctorApi, "get").mockRejectedValue(new DoctorApiError("boom", 500));
    await expect(applicationApi.getMine()).rejects.toThrow("boom");
  });

  it("builds a multipart body with trimmed fields and file descriptors, and nothing else", () => {
    const append = jest.spyOn(FormData.prototype, "append");
    buildApplicationForm(
      { fullName: "  Dr Asha Verma  ", city: "Pune" },
      { graduationCertificate: { uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 } },
    );
    const calls = append.mock.calls;
    expect(calls.map((c) => c[0])).toEqual(["fullName", "city", "graduationCertificate"]);
    expect(calls[0][1]).toBe("Dr Asha Verma");
    expect(calls[2][1]).toMatchObject({ uri: "file:///a.pdf", name: "a.pdf", type: "application/pdf" });
  });

  it("never sends status, role or ownership fields (only what the caller passes)", () => {
    const append = jest.spyOn(FormData.prototype, "append");
    buildApplicationForm({ city: "Pune" }, {});
    expect(append.mock.calls.map((c) => c[0])).toEqual(["city"]);
  });
});

describe("statusGuidance", () => {
  const base = { reviewOverdue: false, canResubmit: false };
  it("describes each status without promising approval", () => {
    expect(statusGuidance({ ...base, status: "PENDING_VERIFICATION" })).toMatch(/waiting for a reviewer/);
    expect(statusGuidance({ ...base, status: "UNDER_REVIEW" })).toMatch(/reviewer is checking/);
    expect(statusGuidance({ ...base, status: "NEEDS_INFO", canResubmit: true })).toMatch(/needs something/);
    expect(statusGuidance({ ...base, status: "REJECTED", canResubmit: true })).toMatch(/resubmit/);
    expect(statusGuidance({ ...base, status: "REJECTED" })).not.toMatch(/resubmit/);
    expect(statusGuidance({ ...base, status: "APPROVED" })).toMatch(/approved by a reviewer/);
  });

  it("says an overdue application is NOT rejected and is never auto-approved", () => {
    const text = statusGuidance({ ...base, status: "PENDING_VERIFICATION", reviewOverdue: true });
    expect(text).toMatch(/has not been rejected/);
    expect(text).not.toMatch(/approved/i);
  });
});
