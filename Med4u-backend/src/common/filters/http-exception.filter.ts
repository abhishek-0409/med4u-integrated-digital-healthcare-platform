import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { error as errorResponse } from '../utils/response.util';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.extract(exception);

    this.logger.error(
      `${request.method} ${request.url} → ${status} ${code}: ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
      GlobalHttpExceptionFilter.name,
    );

    response.status(status).json(errorResponse(code, message, details));
  }

  private extract(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        return { status, code: this.statusToCode(status), message: raw };
      }

      const body = raw as Record<string, unknown>;
      // NestJS ValidationPipe sends message as string[]
      if (Array.isArray(body.message)) {
        return {
          status,
          code: (body.code as string | undefined) ?? this.statusToCode(status),
          message: 'Validation failed',
          details: body.message,
        };
      }

      return {
        status,
        code: (body.code as string | undefined) ?? this.statusToCode(status),
        message: (body.message as string | undefined) ?? exception.message,
        details: body.details,
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details:
          process.env.NODE_ENV !== 'production'
            ? { name: exception.name, message: exception.message }
            : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      410: 'GONE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
