import { UserRole } from '../../database/entities/user.entity';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  isVerified: boolean;
}

export interface LoginResponse extends AuthTokens {
  user: UserProfile;
  isNewUser: boolean;
  isProfileComplete: boolean;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}
