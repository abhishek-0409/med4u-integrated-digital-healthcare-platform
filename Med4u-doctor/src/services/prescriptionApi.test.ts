import { doctorApi } from "../api/client";
import { isRetryable, prescriptionApi, retryIdempotent } from "./prescriptionApi";

jest.mock("../api/client", () => ({
  doctorApi: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), getPage: jest.fn() },
}));

const networkError = Object.assign(new Error("Could not connect"), { status: undefined });
const noSleep = { sleep: async () => undefined };

describe("retryIdempotent", () => {
  it("retries a lost response and returns the eventual success", async () => {
    const send = jest.fn().mockRejectedValueOnce(networkError).mockRejectedValueOnce(Object.assign(new Error("x"), { status: 503 })).mockResolvedValue("ok");
    await expect(retryIdempotent(send, noSleep)).resolves.toBe("ok");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt limit and surfaces the last error", async () => {
    const send = jest.fn().mockRejectedValue(networkError);
    await expect(retryIdempotent(send, { attempts: 2, ...noSleep })).rejects.toBe(networkError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry a definite rejection such as validation, authorization or conflict", async () => {
    for (const status of [400, 401, 403, 404, 409]) {
      const send = jest.fn().mockRejectedValue(Object.assign(new Error("no"), { status }));
      await expect(retryIdempotent(send, noSleep)).rejects.toBeDefined();
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  it("classifies transient failures", () => {
    expect([undefined, 408, 429, 500, 503].every((s) => isRetryable({ status: s }))).toBe(true);
    expect([400, 401, 403, 404, 409].some((s) => isRetryable({ status: s }))).toBe(false);
  });
});

describe("prescriptionApi", () => {
  beforeEach(() => jest.clearAllMocks());

  it("addresses everything by appointment/prescription id and never sends doctor or patient identity", async () => {
    await prescriptionApi.saveDraft("appt 1", { diagnosis: "x", medicines: [], recommendedTests: [], additionalInstructions: null, warnings: null, followUpDate: null });
    expect(doctorApi.put).toHaveBeenCalledWith("/api/v1/doctor/appointments/appt%201/prescription/draft", expect.not.objectContaining({ patientId: expect.anything(), doctorId: expect.anything() }));
    await prescriptionApi.issue("rx-1", 3);
    expect(doctorApi.post).toHaveBeenCalledWith("/api/v1/doctor/prescriptions/rx-1/issue", { revision: 3 });
  });

  it("searches the existing medicine catalog", async () => {
    jest.mocked(doctorApi.getPage).mockResolvedValue({ items: [{ id: "v1" }], total: 1 } as never);
    await expect(prescriptionApi.searchCatalog("para")).resolves.toEqual([{ id: "v1" }]);
    expect(doctorApi.getPage).toHaveBeenCalledWith("/api/v1/medicines", { params: { search: "para", limit: 8 } });
  });

  it("searches the active lab catalog for prescription recommendations", async () => {
    jest.mocked(doctorApi.get).mockResolvedValue([{ id: "test-1", name: "CBC", category: "Blood", isDemo: false }] as never);
    await expect(prescriptionApi.searchLabTests("cbc panel")).resolves.toEqual([{ id: "test-1", name: "CBC", category: "Blood", isDemo: false }]);
    expect(doctorApi.get).toHaveBeenCalledWith("/api/v1/doctor/lab-tests?search=cbc%20panel");
  });
});
