import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { JwtPayload } from '../common/types/jwt-payload.types';

export interface AuthenticatedSocket extends Socket {
  data: Socket['data'] & {
    user: JwtPayload;
    consultationRoomId?: string;
  };
}

@Injectable()
export class SocketAuthMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Attach to a Socket.IO namespace in your gateway's afterInit():
   *   server.use((socket, next) => this.socketAuthMiddleware.use(socket as AuthenticatedSocket, next));
   */
  use(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
    try {
      const token = this.extractToken(socket);
      if (!token) {
        next(new Error('UNAUTHORIZED: no token provided'));
        return;
      }

      // Room tokens use the consultation secret; plain access tokens are also accepted.
      const consultationSecret = this.configService.getOrThrow<string>(
        'jwt.consultationSecret',
      );
      const jwtSecret = this.configService.get<string>('jwt.secret');

      let payload: JwtPayload;
      let consultationRoomId: string | undefined;
      try {
        const roomPayload = this.jwtService.verify<JwtPayload & { roomId?: string; type?: string }>(token, {
          secret: consultationSecret,
        });
        if (roomPayload.type !== 'consultation' || !roomPayload.roomId) {
          throw new Error('Invalid consultation token.');
        }
        payload = roomPayload;
        consultationRoomId = roomPayload.roomId;
      } catch {
        payload = this.jwtService.verify<JwtPayload>(token, {
          secret: jwtSecret,
        });
      }
      socket.data.user = payload;
      socket.data.consultationRoomId = consultationRoomId;
      next();
    } catch {
      // Disconnect to prevent unauthenticated socket from staying connected
      socket.disconnect(true);
      next(new Error('UNAUTHORIZED: invalid or expired token'));
    }
  }

  private extractToken(socket: Socket): string | null {
    // Priority: auth.token → Authorization header
    const authToken = socket.handshake.auth['token'] as string | undefined;
    if (authToken) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const authHeader = socket.handshake.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }
}
