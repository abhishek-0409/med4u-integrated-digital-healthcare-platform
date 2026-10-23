import { PaginationMeta } from '../types/api-response.types';

export class PaginatedResponse<T> {
  readonly data: T[];
  readonly meta: PaginationMeta;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export function getPaginationParams(query: PaginationQuery): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 10));
  return { page, limit, skip: (page - 1) * limit };
}
