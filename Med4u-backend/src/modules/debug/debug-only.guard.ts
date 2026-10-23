import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Debug routes are unauthenticated and can expose user data or mutate local data.
 * Keep them disabled unless a developer explicitly opts in to local debugging.
 */
@Injectable()
export class DebugOnlyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const isLocalDevelopment = this.config.get<string>('NODE_ENV') === 'development';
    const explicitlyEnabled = this.config.get<boolean>('DEBUG_ROUTES_ENABLED', false);
    if (!isLocalDevelopment || !explicitlyEnabled) {
      throw new NotFoundException();
    }
    return true;
  }
}
