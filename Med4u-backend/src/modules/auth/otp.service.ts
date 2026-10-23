import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomInt } from 'crypto';
import Twilio = require('twilio');
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { hashString, compareHash } from '../../common/utils/hash.util';
import {
  demoDoctorLoginEnabled,
  isDemoDoctorPhone,
  isDemoVideoTestPatientPhone,
} from './demo-doctor';

const KEY = {
  code: (phone: string) => `otp:code:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  rate: (phone: string) => `otp:rate:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
};

const RATE_MAX = 3;
const RATE_WINDOW_S = 600; // 10 minutes
const COOLDOWN_S = 60;
const OTP_TTL_S = 300; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 3;

@Injectable()
export class OtpService implements OnModuleInit {
  private twilioClient?: Twilio.Twilio;
  private twilioPhone?: string;
  private readonly isDev: boolean;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.isDev = configService.get<string>('NODE_ENV') !== 'production';
  }

  onModuleInit(): void {
    const sid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioPhone = this.configService.get<string>('TWILIO_PHONE_NUMBER');

    if (sid && token && sid.startsWith('AC')) {
      this.twilioClient = Twilio(sid, token);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async sendOtp(phone: string): Promise<void> {
    // The reserved demo number is never a real subscriber: outside an explicitly enabled development run
    // it is refused outright rather than handed to the SMS provider.
    if (
      (isDemoDoctorPhone(phone) || isDemoVideoTestPatientPhone(phone)) &&
      !demoDoctorLoginEnabled() &&
      !this.isDev
    ) {
      throw new BadRequestException({
        code: 'RESERVED_PHONE_NUMBER',
        message: 'This phone number is reserved and cannot be used.',
      });
    }
    // A patient OTP must have an actual delivery channel. Never print the phone or code to
    // application logs as a development fallback. The reserved demo doctor has its own
    // explicitly configured local code and does not use SMS.
    if (!(isDemoDoctorPhone(phone) && demoDoctorLoginEnabled()) && (!this.twilioClient || !this.twilioPhone)) {
      throw new ServiceUnavailableException({
        code: 'SMS_UNAVAILABLE',
        message: 'SMS delivery is not configured.',
      });
    }
    await this.checkCooldown(phone);
    await this.checkRateLimit(phone);

    const otp = this.generateCode(phone);
    const hashed = await hashString(otp);

    const pipeline = this.redis.pipeline();
    pipeline.setex(KEY.code(phone), OTP_TTL_S, hashed);
    pipeline.del(KEY.attempts(phone)); // reset verify attempts on new send
    pipeline.setex(KEY.cooldown(phone), COOLDOWN_S, '1');
    await pipeline.exec();

    await this.deliver(phone, otp);
  }

  async verifyOtp(phone: string, otp: string): Promise<void> {
    const hashed = await this.redis.get(KEY.code(phone));
    if (!hashed) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'OTP has expired or was not sent. Please request a new one.',
      });
    }

    const attempts = await this.redis.incr(KEY.attempts(phone));
    // Ensure attempts key has a TTL (first increment only)
    if (attempts === 1) {
      await this.redis.expire(KEY.attempts(phone), OTP_TTL_S);
    }

    if (attempts > MAX_VERIFY_ATTEMPTS) {
      // Invalidate the OTP to force a re-send
      await this.redis.del(KEY.code(phone));
      await this.redis.del(KEY.attempts(phone));
      throw new HttpException(
        { code: 'OTP_LOCKED', message: 'Too many failed attempts. Please request a new OTP.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const valid = await compareHash(otp, hashed);
    if (!valid) {
      const remaining = MAX_VERIFY_ATTEMPTS - attempts;
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
    }

    // Consumed — remove from Redis
    await this.redis.del(KEY.code(phone));
    await this.redis.del(KEY.attempts(phone));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private generateCode(phone: string): string {
    // Development-only demo login: ONE reserved number gets a configured code. Everyone else is random.
    if (isDemoDoctorPhone(phone) && demoDoctorLoginEnabled())
      return process.env.DEMO_DOCTOR_OTP as string;
    // randomInt is cryptographically secure (crypto module)
    return randomInt(100_000, 1_000_000).toString();
  }

  private async checkCooldown(phone: string): Promise<void> {
    const ttl = await this.redis.ttl(KEY.cooldown(phone));
    if (ttl > 0) {
      throw new HttpException(
        {
          code: 'OTP_COOLDOWN',
          message: `Please wait ${ttl} second${ttl === 1 ? '' : 's'} before requesting a new OTP.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async checkRateLimit(phone: string): Promise<void> {
    const count = await this.redis.incr(KEY.rate(phone));
    if (count === 1) {
      // First request in window — set expiry
      await this.redis.expire(KEY.rate(phone), RATE_WINDOW_S);
    }
    if (count > RATE_MAX) {
      const ttl = await this.redis.ttl(KEY.rate(phone));
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMIT',
          message: `Too many OTP requests. Try again in ${Math.ceil(ttl / 60)} minute${ttl > 60 ? 's' : ''}.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async deliver(phone: string, otp: string): Promise<void> {
    if (isDemoDoctorPhone(phone) && demoDoctorLoginEnabled()) {
      // Never texted, and the code is not echoed: it is the DEMO_DOCTOR_OTP value in the local environment.
      console.log('[OTP DEV] demo doctor account: use the configured DEMO_DOCTOR_OTP');
      return;
    }
    if (!this.twilioClient || !this.twilioPhone) throw new Error('SMS delivery channel was not initialized.');
    await this.twilioClient.messages.create({
      to: phone,
      from: this.twilioPhone,
      body: `Your Med4U verification code is: ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
    });
  }
}
