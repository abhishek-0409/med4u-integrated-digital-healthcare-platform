import { UserRole } from '../../database/entities/user.entity';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
