import { Injectable } from '@nestjs/common';
import { UserRepository, UserProfileRow } from './user.repository';
import { isProfileComplete } from './profile-completion';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MedicalHistoryDto } from './dto/medical-history.dto';
import { UserProfileResponse, MedicalHistoryResponse } from './user.types';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  // ── GET /me ────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.userRepo.requireProfileById(userId);
    return this.toProfileResponse(user);
  }

  // ── PATCH /me ──────────────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    // Guard email uniqueness before touching the DB
    if (dto.email) {
      await this.userRepo.assertEmailAvailable(dto.email, userId);
    }

    const updated = await this.userRepo.updateProfile(userId, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...('email' in dto && { email: dto.email }),
      ...('dob' in dto && { dob: dto.dob ?? null }),
      ...('gender' in dto && { gender: dto.gender }),
      ...('bloodGroup' in dto && { bloodGroup: dto.bloodGroup }),
      ...('heightCm' in dto && { heightCm: dto.heightCm }),
      ...('weightKg' in dto && { weightKg: dto.weightKg }),
      ...('avatarUrl' in dto && { avatarUrl: dto.avatarUrl }),
    });

    return this.toProfileResponse(updated);
  }

  // ── GET /me/medical-history ───────────────────────────────────────────────

  async getMedicalHistory(userId: string): Promise<MedicalHistoryResponse> {
    // Ensure user exists (throws 404 if not)
    await this.userRepo.requireProfileById(userId);

    const history = await this.userRepo.findMedicalHistory(userId);
    return history ? this.toHistoryResponse(history) : this.emptyHistory(userId);
  }

  // ── POST /me/medical-history ──────────────────────────────────────────────

  async upsertMedicalHistory(
    userId: string,
    dto: MedicalHistoryDto,
  ): Promise<MedicalHistoryResponse> {
    // Ensure user exists before creating/updating history
    await this.userRepo.requireProfileById(userId);

    const history = await this.userRepo.upsertMedicalHistory(userId, {
      ...(dto.allergies !== undefined && { allergies: dto.allergies }),
      ...(dto.chronicConditions !== undefined && {
        chronicConditions: dto.chronicConditions,
      }),
      ...(dto.pastSurgeries !== undefined && { pastSurgeries: dto.pastSurgeries }),
      ...(dto.currentMedications !== undefined && {
        currentMedications: dto.currentMedications,
      }),
      ...(dto.familyHistory !== undefined && { familyHistory: dto.familyHistory }),
      ...('notes' in dto && { notes: dto.notes }),
    });

    return this.toHistoryResponse(history);
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toProfileResponse(user: UserProfileRow): UserProfileResponse {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
      dob: user.dob ? this.formatDate(user.dob) : null,
      gender: user.gender ?? null,
      bloodGroup: user.bloodGroup ?? null,
      heightCm: user.heightCm ?? null,
      weightKg: user.weightKg ?? null,
      isProfileComplete: isProfileComplete({
        phone: user.phone,
        name: user.name,
        email: user.email ?? undefined,
        dob: user.dob ?? undefined,
        gender: (user.gender ?? undefined) as never,
        bloodGroup: (user.bloodGroup ?? undefined) as never,
      }),
      role: user.role as UserProfileResponse['role'],
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toHistoryResponse(
    h: NonNullable<Awaited<ReturnType<UserRepository['findMedicalHistory']>>>,
  ): MedicalHistoryResponse {
    return {
      id: h.id,
      userId: h.userId,
      allergies: h.allergies,
      chronicConditions: h.chronicConditions,
      pastSurgeries: h.pastSurgeries,
      currentMedications: h.currentMedications,
      familyHistory: h.familyHistory,
      notes: h.notes ?? null,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    };
  }

  private emptyHistory(userId: string): MedicalHistoryResponse {
    return {
      id: null,
      userId,
      allergies: [],
      chronicConditions: [],
      pastSurgeries: [],
      currentMedications: [],
      familyHistory: [],
      notes: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  /** Format a Date or date string to a YYYY-MM-DD string. */
  private formatDate(date: Date | string): string {
    if (typeof date === 'string') return date.split('T')[0];
    return date.toISOString().split('T')[0];
  }
}
