import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Session } from '../../database/entities/session.entity';
import { User } from '../../database/entities/user.entity';
import { hashString } from '../../common/utils/hash.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { AuthTokens, RefreshPayload } from './auth.types';

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiry: string;
  private readonly refreshExpiry: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    this.accessSecret = configService.getOrThrow<string>('jwt.secret');
    this.refreshSecret = configService.getOrThrow<string>('jwt.refreshSecret');
    this.accessExpiry = configService.get<string>('jwt.expiresIn', '15m');
    this.refreshExpiry = configService.get<string>('jwt.refreshExpiresIn', '7d');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async generateTokenPair(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();

    const accessToken = this.signAccess(user);
    const refreshToken = this.signRefresh(user.id, sessionId);

    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    const hashed = await hashString(refreshToken);
    await this.sessionRepo.save(
      this.sessionRepo.create({
        id: sessionId,
        userId: user.id,
        refreshToken: hashed,
        expiresAt,
        ipAddress: ip,
        userAgent,
      }),
    );

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(
    oldToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(oldToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token. Please log in again.',
      });
    }

    const session = await this.sessionRepo.findOne({
      where: { id: payload.jti, userId: payload.sub, isRevoked: false },
    });

    if (!session) {
      // Token reuse detected — revoke every session for this user as a precaution
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE',
        message: 'Refresh token already used. All sessions revoked for security. Please log in again.',
      });
    }

    if (session.expiresAt < new Date()) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session has expired. Please log in again.',
      });
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'User account is inactive or no longer exists.',
      });
    }

    // Revoke old session before issuing new pair (rotation)
    await this.revokeSession(session.id);

    return this.generateTokenPair(user, ip, userAgent);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepo.update(sessionId, { isRevoked: true });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessionRepo.update({ userId, isRevoked: false }, { isRevoked: true });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private signAccess(user: User): string {
    const payload: JwtPayload = { sub: user.id, phone: user.phone, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiry,
    });
  }

  private signRefresh(userId: string, sessionId: string): string {
    const payload: RefreshPayload = {
      sub: userId,
      jti: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: 0, // overridden by expiresIn
    };
    // Omit iat/exp from literal object — JWT lib fills them
    const { iat: _iat, exp: _exp, ...rest } = payload;
    void _iat;
    void _exp;
    return this.jwtService.sign(rest, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiry,
    });
  }
}
