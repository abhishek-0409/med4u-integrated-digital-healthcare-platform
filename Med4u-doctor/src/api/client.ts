import axios, { AxiosAdapter, AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { env } from "../config/env";
import { AuthTokens } from "../types/auth";
import { tokenStorage } from "../services/tokenStorage";

declare module "axios" {
  interface AxiosRequestConfig { skipAuth?: boolean; _retried?: boolean; }
  interface InternalAxiosRequestConfig { skipAuth?: boolean; _retried?: boolean; }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: { code?: string; message?: string; details?: Record<string, string[]> } | null;
  meta?: unknown;
}

export class DoctorApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly details?: Record<string, string[]>) {
    super(message);
    this.name = "DoctorApiError";
  }
  get isUnauthorized(): boolean { return this.status === 401; }
}

export function toDoctorApiError(error: unknown): DoctorApiError {
  if (error instanceof DoctorApiError) return error;
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiEnvelope<unknown> | { message?: string; code?: string; details?: Record<string, string[]> } | undefined;
    const payload = body && "error" in body ? body.error : body;
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : error.code === "ECONNABORTED"
        ? "The request timed out. Check your connection and try again."
        : error.response
          ? `Request failed (${error.response.status}). Please try again.`
          : "Could not connect. Check your internet connection and try again.";
    const status = error.response?.status;
    const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    const details = payload && typeof payload === "object" && "details" in payload && payload.details && typeof payload.details === "object"
      ? (payload.details as Record<string, string[]>)
      : undefined;
    return new DoctorApiError(message, status, code, details);
  }
  return new DoctorApiError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
}

interface TokenStore {
  get(): AuthTokens | null;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export class DoctorApiClient {
  private readonly http: AxiosInstance;
  private transientTokens: AuthTokens | null = null;
  private refreshInFlight: Promise<AuthTokens> | null = null;
  private onSessionExpired: (() => void) | null = null;

  constructor(
    baseURL: string = env.apiUrl,
    private readonly storage: TokenStore = tokenStorage,
    adapter?: AxiosAdapter,
  ) {
    this.http = axios.create({
      baseURL: baseURL.replace(/\/$/, ""),
      timeout: 12_000,
      headers: { "Content-Type": "application/json" },
      ...(adapter ? { adapter } : {}),
    });
    this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = this.transientTokens?.accessToken ?? this.storage.get()?.accessToken;
      if (!config.skipAuth && token) config.headers.set("Authorization", `Bearer ${token}`);
      return config;
    });
    this.http.interceptors.response.use((response) => response, async (error: unknown) => {
      if (!axios.isAxiosError(error) || !error.config) throw error;
      const original = error.config;
      if (error.response?.status !== 401 || original.skipAuth || original._retried) throw error;
      original._retried = true;
      try {
        await this.refreshTokens();
      } catch (refreshError) {
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) {
          await this.storage.clear();
          this.onSessionExpired?.();
        }
        throw refreshError;
      }
      return this.http.request(original);
    });
  }

  get isConfigured(): boolean { return Boolean(this.http.defaults.baseURL); }
  setTransientTokens(tokens: AuthTokens | null): void { this.transientTokens = tokens; }
  async persistTransientSession(): Promise<void> {
    if (!this.transientTokens) throw new DoctorApiError("No verified session is available to persist.");
    await this.storage.save(this.transientTokens);
    this.transientTokens = null;
  }
  setSessionExpiredHandler(handler: (() => void) | null): void { this.onSessionExpired = handler; }

  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> { return this.request<T>({ ...config, method: "GET", url: path }); }
  /** GET for paginated endpoints: returns the items together with the server's total count. */
  async getPage<T>(path: string, config?: AxiosRequestConfig): Promise<{ items: T[]; total: number }> {
    if (!this.isConfigured) throw new DoctorApiError("API is not configured. Set EXPO_PUBLIC_API_URL and restart Expo.");
    try {
      const response = await this.http.request<ApiEnvelope<T[]>>({ ...config, method: "GET", url: path });
      const envelope = response.data;
      if (!envelope || !envelope.success || !Array.isArray(envelope.data)) {
        throw new DoctorApiError(envelope?.error?.message ?? "The server returned an unexpected response.", response.status, envelope?.error?.code);
      }
      const total = (envelope.meta as { total?: unknown } | null | undefined)?.total;
      return { items: envelope.data, total: typeof total === "number" ? total : envelope.data.length };
    } catch (error) {
      throw toDoctorApiError(error);
    }
  }
  async post<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> { return this.request<T>({ ...config, method: "POST", url: path, data: body }); }
  async patch<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> { return this.request<T>({ ...config, method: "PATCH", url: path, data: body }); }
  async put<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> { return this.request<T>({ ...config, method: "PUT", url: path, data: body }); }
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> { return this.request<T>({ ...config, method: "DELETE", url: path }); }

  /** Multipart upload (certificates). Longer timeout; the platform sets the multipart boundary. */
  async postForm<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
    return this.request<T>({
      method: "POST",
      url: path,
      data: form,
      timeout: 90_000,
      headers: { "Content-Type": "multipart/form-data" },
      transformRequest: (data: unknown) => data,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
      },
    });
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    if (!this.isConfigured) throw new DoctorApiError("API is not configured. Set EXPO_PUBLIC_API_URL and restart Expo.");
    try {
      const response = await this.http.request<ApiEnvelope<T>>(config);
      const envelope = response.data;
      if (envelope && typeof envelope === "object" && "success" in envelope) {
        if (!envelope.success) throw new DoctorApiError(envelope.error?.message ?? "The server rejected the request.", response.status, envelope.error?.code);
        return envelope.data as T;
      }
      return response.data as T;
    } catch (error) {
      throw toDoctorApiError(error);
    }
  }

  private refreshTokens(): Promise<AuthTokens> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        const current = this.transientTokens ?? this.storage.get();
        if (!current) throw new DoctorApiError("Your session has expired. Sign in again.", 401);
        const response = await this.http.post<ApiEnvelope<AuthTokens>>(
          "/api/v1/auth/refresh",
          { refreshToken: current.refreshToken },
          { skipAuth: true },
        );
        const tokens = (response.data as ApiEnvelope<AuthTokens>).data;
        if (!tokens?.accessToken || !tokens.refreshToken) throw new DoctorApiError("The server returned an invalid refresh response.", 500);
        if (this.transientTokens) this.transientTokens = tokens;
        else await this.storage.save(tokens);
        return tokens;
      })().finally(() => { this.refreshInFlight = null; });
    }
    return this.refreshInFlight;
  }
}

export const doctorApi = new DoctorApiClient();
