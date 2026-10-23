import axios from "axios";

export type ApiErrorKind = "network" | "timeout" | "http";

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown; details?: unknown } | null;
}

const MAX_MESSAGE_LENGTH = 200;

/** Fallbacks used when the server gives no message we can safely show. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your input.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "This conflicts with existing data. Please refresh and try again.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "The server ran into a problem. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly code?: string,
    /** Machine-readable extras from the server, e.g. { currentTotal } on PRICE_CHANGED. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isConnectivity(): boolean {
    return this.kind === "network" || this.kind === "timeout";
  }
}

/** Converts anything thrown by the HTTP layer into an ApiError with a user-safe message. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError<ErrorEnvelope>(error)) {
    const response = error.response;

    if (!response) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return new ApiError("The request timed out. Please try again.", "timeout");
      }
      return new ApiError(
        "Can't reach the server. Check your internet connection and try again.",
        "network",
      );
    }

    const status = response.status;
    const serverError = response.data?.error;
    const code = typeof serverError?.code === "string" ? serverError.code : undefined;
    // Only surface server messages for client errors: 5xx bodies can carry internals.
    const serverMessage =
      status < 500 && typeof serverError?.message === "string"
        ? serverError.message.trim().slice(0, MAX_MESSAGE_LENGTH)
        : "";

    return new ApiError(
      serverMessage || STATUS_MESSAGES[status] || "Something went wrong. Please try again.",
      "http",
      status,
      code,
      status < 500 ? serverError?.details : undefined,
    );
  }

  return new ApiError("Something went wrong. Please try again.", "http");
}
