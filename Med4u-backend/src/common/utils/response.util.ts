import { ApiError, ApiResponse, PaginationMeta } from '../types/api-response.types';

export function success<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    ...(meta ? { meta } : {}),
  };
}

export function error(
  code: string,
  message: string,
  details?: unknown,
): ApiResponse<null> {
  const apiError: ApiError = { code, message };
  if (details !== undefined) apiError.details = details;
  return { success: false, data: null, error: apiError };
}
