import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { env } from "../../config/env";
import { Paginated, PageMeta } from "../../types/api";
import { AuthTokens } from "../../types/auth";
import { tokenStorage } from "../tokenStorage";
import { ApiError, toApiError } from "./errors";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Public endpoints (login, refresh) skip the Authorization header and 401 handling. */
    skipAuth?: boolean;
  }
  interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

/** Shape of every successful backend response (see the backend ResponseInterceptor). */
interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  /** Present on paginated list responses. */
  meta?: PageMeta;
}

const REQUEST_TIMEOUT_MS = 12_000;

const http = axios.create({
  baseURL: env.apiUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

// ── Session expiry hook ─────────────────────────────────────────────────────
// The auth store registers a handler so this module never imports it (no cycle).
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

// ── Authorization header ────────────────────────────────────────────────────
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = tokenStorage.get();
  if (!config.skipAuth && tokens) {
    config.headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }
  return config;
});

// ── Refresh-on-401 (single flight) ──────────────────────────────────────────
// Refresh tokens rotate and the backend revokes every session when one is
// reused, so concurrent 401s must share one refresh call.
let refreshInFlight: Promise<AuthTokens> | null = null;

function refreshTokens(): Promise<AuthTokens> {
  refreshInFlight ??= (async () => {
    const current = tokenStorage.get();
    if (!current) {
      throw new ApiError("Not signed in.", "http", 401);
    }
    const response = await http.post<ApiEnvelope<AuthTokens>>(
      "/v1/auth/refresh",
      { refreshToken: current.refreshToken },
      { skipAuth: true },
    );
    const next = response.data.data;
    if (!next) {
      throw new ApiError("Unexpected server response.", "http", 500);
    }
    const tokens = { accessToken: next.accessToken, refreshToken: next.refreshToken };
    await tokenStorage.save(tokens);
    return tokens;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.config) {
    throw error;
  }
  const original = error.config;

  if (error.response?.status !== 401 || original.skipAuth || original._retried) {
    throw error;
  }
  original._retried = true;

  try {
    await refreshTokens();
  } catch (refreshError) {
    // Only an explicit rejection ends the session; being offline must not log the user out.
    if (toApiError(refreshError).isUnauthorized) {
      await tokenStorage.clear();
      onSessionExpired?.();
    }
    throw refreshError;
  }
  return http.request(original);
});

// ── Typed request helpers ───────────────────────────────────────────────────
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<ApiEnvelope<T>>(config);
    return response.data.data as T;
  } catch (error) {
    throw toApiError(error);
  }
}

async function requestPage<T>(config: AxiosRequestConfig): Promise<Paginated<T>> {
  try {
    const response = await http.request<ApiEnvelope<T[]>>(config);
    const { data, meta } = response.data;
    return {
      items: data ?? [],
      meta: meta ?? { page: 1, limit: data?.length ?? 0, total: data?.length ?? 0, totalPages: 1 },
    };
  } catch (error) {
    throw toApiError(error);
  }
}

/** Authenticated download of a binary body (e.g. a prescription file). Returns bytes and content type. */
async function requestBinary(url: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  try {
    const response = await http.request<ArrayBuffer>({ method: "GET", url, responseType: "arraybuffer", timeout: 60_000 });
    return { data: response.data, contentType: String(response.headers["content-type"] ?? "") };
  } catch (error) {
    throw toApiError(error);
  }
}

export const api = {
  getBinary: requestBinary,
  getPage: <T>(url: string, config?: AxiosRequestConfig) =>
    requestPage<T>({ ...config, method: "GET", url }),
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "GET", url }),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "POST", url, data: body }),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "PUT", url, data: body }),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "PATCH", url, data: body }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "DELETE", url }),
};
