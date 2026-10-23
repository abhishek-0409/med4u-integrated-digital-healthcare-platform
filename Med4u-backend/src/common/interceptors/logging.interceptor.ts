import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { method, ip } = req;
    // Medical record identifiers must not be copied into routine access logs.
    const url = req.originalUrl.replace(
      /(medical-reports|prescription-uploads|prescriptions)\/[^/?]+/g,
      '$1/[redacted]',
    );
    const userAgent = req.headers['user-agent'] ?? '-';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${method} ${url} ${res.statusCode} ${Date.now() - start}ms — ${ip} "${userAgent}"`,
            LoggingInterceptor.name,
          );
        },
        error: () => {
          // Error path duration only — the filter handles the actual error log
          this.logger.warn(
            `${method} ${url} ERR ${Date.now() - start}ms — ${ip}`,
            LoggingInterceptor.name,
          );
        },
      }),
    );
  }
}
