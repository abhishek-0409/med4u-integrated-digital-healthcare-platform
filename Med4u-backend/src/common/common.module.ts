import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD, Reflector } from '@nestjs/core';
import { GlobalHttpExceptionFilter } from './filters/http-exception.filter';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  providers: [
    Reflector,

    // ── Global filter ─────────────────────────────────────────────────────
    { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },

    // ── Global interceptors (registration order = call order on request) ──
    // LoggingInterceptor wraps outermost so it measures total round-trip time.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },

    // ── Global guards ─────────────────────────────────────────────────────
    // JwtAuthGuard runs first; it respects @Public() to skip protected routes.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [Reflector],
})
export class CommonModule {}
