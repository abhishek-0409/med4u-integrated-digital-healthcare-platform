import axios, { AxiosAdapter, AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { DoctorApiClient } from "./client";
import { AuthTokens } from "../types/auth";

const firstTokens: AuthTokens = { accessToken: "old-access", refreshToken: "old-refresh" };
const rotatedTokens: AuthTokens = { accessToken: "new-access", refreshToken: "new-refresh" };

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return { data, status, statusText: "OK", headers: new AxiosHeaders(), config };
}
function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, {
    data: { success: false, data: null, error: { message: "Unauthorized" } },
    status: 401, statusText: "Unauthorized", headers: new AxiosHeaders(), config,
  });
}

describe("DoctorApiClient auth interceptors", () => {
  it("attaches bearer access tokens and shares one rotated refresh across concurrent requests", async () => {
    let stored: AuthTokens | null = firstTokens;
    let refreshCalls = 0;
    let initialUnauthorized = 0;
    const adapter: AxiosAdapter = async (config) => {
      if (config.url === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return response(config as InternalAxiosRequestConfig, { success: true, data: rotatedTokens, error: null });
      }
      const auth = config.headers.get("Authorization");
      if (auth === "Bearer old-access" && initialUnauthorized < 2) {
        initialUnauthorized += 1;
        throw unauthorized(config as InternalAxiosRequestConfig);
      }
      if (auth !== "Bearer new-access") throw new Error(`Unexpected auth header ${String(auth)}`);
      return response(config as InternalAxiosRequestConfig, { success: true, data: { ok: true }, error: null });
    };
    const storage = {
      get: () => stored,
      save: async (value: AuthTokens) => { stored = value; },
      clear: async () => { stored = null; },
    };
    const client = new DoctorApiClient("https://api.example", storage, adapter);
    const [one, two] = await Promise.all([client.get<{ ok: boolean }>("/secure/one"), client.get<{ ok: boolean }>("/secure/two")]);
    expect(one.ok && two.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(stored).toEqual(rotatedTokens);
  });

  it("clears tokens and notifies auth when refresh is rejected", async () => {
    let stored: AuthTokens | null = firstTokens;
    const adapter: AxiosAdapter = async (config) => {
      if (config.url === "/api/v1/auth/refresh") throw unauthorized(config as InternalAxiosRequestConfig);
      throw unauthorized(config as InternalAxiosRequestConfig);
    };
    const storage = { get: () => stored, save: async (value: AuthTokens) => { stored = value; }, clear: async () => { stored = null; } };
    const client = new DoctorApiClient("https://api.example", storage, adapter);
    const expired = jest.fn();
    client.setSessionExpiredHandler(expired);
    await expect(client.get("/secure")).rejects.toThrow();
    expect(stored).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("skips auth for public requests", async () => {
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get("Authorization")).toBeUndefined();
      return response(config as InternalAxiosRequestConfig, { success: true, data: { message: "sent" } });
    };
    const client = new DoctorApiClient("https://api.example", { get: () => firstTokens, save: async () => undefined, clear: async () => undefined }, adapter);
    await expect(client.post("/api/v1/auth/send-otp", { phone: "+919876543210" }, { skipAuth: true })).resolves.toEqual({ message: "sent" });
  });
});

describe("DoctorApiClient.getPage", () => {
  const ok = (data: unknown, meta?: unknown): AxiosAdapter => async (config) => response(config as InternalAxiosRequestConfig, { success: true, data, error: null, meta });
  const storage = { get: () => null, save: async () => {}, clear: async () => {} };

  it("returns items with the server total", async () => {
    const client = new DoctorApiClient("http://api.test", storage, ok([{ id: 1 }], { total: 7 }));
    await expect(client.getPage("/x")).resolves.toEqual({ items: [{ id: 1 }], total: 7 });
  });
  it("falls back to the item count and rejects non-list payloads", async () => {
    await expect(new DoctorApiClient("http://api.test", storage, ok([1, 2])).getPage("/x")).resolves.toEqual({ items: [1, 2], total: 2 });
    await expect(new DoctorApiClient("http://api.test", storage, ok({ not: "a list" })).getPage("/x")).rejects.toThrow();
  });
});
