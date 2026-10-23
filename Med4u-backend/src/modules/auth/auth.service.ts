import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { isProfileComplete } from '../users/profile-completion';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthTokens, LoginResponse, UserProfile } from './auth.types';
import {
  demoDoctorLoginEnabled,
  isDemoAccountEmail,
  isDemoDoctorPhone,
  isDemoVideoTestPatientEmail,
  isDemoVideoTestPatientPhone,
} from './demo-doctor';

@Injectable()
export class AuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async sendOtp(dto: SendOtpDto): Promise<{ message: string }> {
    await this.otpService.sendOtp(dto.phone);
    return { message: 'OTP sent successfully. Valid for 5 minutes.' };
  }

  async verifyOtp(dto: VerifyOtpDto, ip?: string, userAgent?: string): Promise<LoginResponse> {
    await this.otpService.verifyOtp(dto.phone, dto.otp);
    if (isDemoDoctorPhone(dto.phone)) await this.assertDemoDoctorReady(dto.phone);
    if (isDemoVideoTestPatientPhone(dto.phone)) await this.assertDemoVideoPatientReady(dto.phone);

    let user = await this.userRepo.findOne({
      where: { phone: dto.phone },
      withDeleted: false,
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await this.userRepo.save(
        this.userRepo.create({
          phone: dto.phone,
          name: dto.phone, // placeholder — user updates in profile
          role: UserRole.PATIENT,
          isActive: true,
          isVerified: true,
        }),
      );
    } else {
      if (!user.isActive) {
        throw new ForbiddenException({
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been disabled. Please contact support.',
        });
      }
      // A demo account that reaches a non-demo environment (e.g. a copied database) must be unusable there.
      if (
        (isDemoAccountEmail(user.email) || isDemoVideoTestPatientEmail(user.email)) &&
        !demoDoctorLoginEnabled()
      ) {
        throw new ForbiddenException({
          code: 'DEMO_ACCOUNT_DISABLED',
          message: 'Demo accounts are only available in local development.',
        });
      }
      if (!user.isVerified) {
        await this.userRepo.update(user.id, { isVerified: true });
        user.isVerified = true;
      }
    }

    const tokens = await this.tokenService.generateTokenPair(user, ip, userAgent);
    return {
      ...tokens,
      user: this.toProfile(user),
      isNewUser,
      isProfileComplete: isProfileComplete(user),
    };
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
    return this.tokenService.rotateRefreshToken(refreshToken, ip, userAgent);
  }

  async logout(userId: string): Promise<void> {
    await this.tokenService.revokeAllSessions(userId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * The reserved demo number may only ever sign in as the seeded demo doctor (seeds/seed-demo-doctor.ts), and only
   * while the development-only demo login is enabled. It must never fall through to the generic "unknown phone ->
   * create a patient account" path: that would turn the demo login into an ordinary applicant who is then asked to
   * register as a doctor. No user, application or document is created here.
   */
  private async assertDemoDoctorReady(phone: string): Promise<void> {
    if (!demoDoctorLoginEnabled()) {
      throw new ForbiddenException({
        code: 'DEMO_LOGIN_DISABLED',
        message: 'Demo login is only available in an explicitly enabled local development run.',
      });
    }
    const user = await this.userRepo.findOne({ where: { phone }, withDeleted: true });
    const hasProfile =
      !!user &&
      (await this.userRepo.manager.count(Doctor, {
        where: { userId: user.id },
        withDeleted: true,
      })) > 0;
    if (!user || !isDemoAccountEmail(user.email) || user.role !== UserRole.DOCTOR || !hasProfile) {
      throw new ConflictException({
        code: 'DEMO_DOCTOR_NOT_SEEDED',
        message:
          'Development setup problem: the demo doctor account is not set up in this database. ' +
          'Run the demo seed (npm run demo:doctor) instead of registering. No application was created.',
      });
    }
  }

  private async assertDemoVideoPatientReady(phone: string): Promise<void> {
    if (!demoDoctorLoginEnabled()) {
      throw new ForbiddenException({
        code: 'DEMO_LOGIN_DISABLED',
        message:
          'Synthetic test accounts are only available in explicitly enabled local development.',
      });
    }
    const user = await this.userRepo.findOne({ where: { phone }, withDeleted: true });
    if (
      !user ||
      !isDemoVideoTestPatientEmail(user.email) ||
      user.role !== UserRole.PATIENT ||
      !user.isActive
    ) {
      throw new ConflictException({
        code: 'DEMO_PATIENT_NOT_SEEDED',
        message:
          'Development setup problem: the synthetic video test patient is not set up in this database.',
      });
    }
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isVerified: user.isVerified,
    };
  }
}
