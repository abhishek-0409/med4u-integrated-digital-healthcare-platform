import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../types/api-response.types';
import { PaginatedResponse } from '../utils/pagination.util';

function isPaginated(data: unknown): data is PaginatedResponse<unknown> {
  return (
    data !== null &&
    typeof data === 'object' &&
    Array.isArray((data as Record<string, unknown>).data) &&
    (data as Record<string, unknown>).meta !== undefined
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown>> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof PaginatedResponse || isPaginated(data)) {
          const p = data as PaginatedResponse<unknown>;
          return { success: true, data: p.data, error: null, meta: p.meta };
        }
        return { success: true, data: data ?? null, error: null };
      }),
    );
  }
}
