import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../database/entities/user.entity';
import { JwtPayload } from '../types/jwt-payload.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — guard is a no-op
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Access denied. Authentication required.',
      });
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Access denied. Required role: ${required.join(' or ')}.`,
      });
    }

    return true;
  }
}
