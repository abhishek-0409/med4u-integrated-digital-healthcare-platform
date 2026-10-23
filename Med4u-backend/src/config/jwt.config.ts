import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  // Room tokens must never be verifiable with the access-token secret, so the
  // fallback is derived from JWT_SECRET rather than reusing it (or a literal).
  consultationSecret:
    process.env.CONSULTATION_TOKEN_SECRET ?? `${process.env.JWT_SECRET}:consultation`,
}));
