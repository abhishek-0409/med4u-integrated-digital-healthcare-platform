import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { User } from '../../database/entities/user.entity';
import {
  MedicalHistory,
  SurgeryRecord,
  MedicationRecord,
  FamilyHistoryRecord,
} from '../../database/entities/medical-history.entity';

export interface UserProfileRow {
  id: string;
  phone: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  dob?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileUpdate {
  name?: string;
  email?: string | null;
  dob?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  avatarUrl?: string | null;
}

export interface MedicalHistoryUpdate {
  allergies?: string[];
  chronicConditions?: string[];
  pastSurgeries?: SurgeryRecord[];
  currentMedications?: MedicationRecord[];
  familyHistory?: FamilyHistoryRecord[];
  notes?: string | null;
}

/** Columns safe to return from the profile endpoint — no fcmToken, deletedAt. */
const PROFILE_SELECT = {
  id: true,
  phone: true,
  name: true,
  email: true,
  avatarUrl: true,
  dob: true,
  gender: true,
  bloodGroup: true,
  heightCm: true,
  weightKg: true,
  role: true,
  isActive: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MedicalHistory)
    private readonly histories: Repository<MedicalHistory>,
  ) {}

  // ── User queries ───────────────────────────────────────────────────────────

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findProfileById(id: string): Promise<UserProfileRow | null> {
    return this.users.findOne({
      where: { id },
      select: PROFILE_SELECT,
    }) as Promise<UserProfileRow | null>;
  }

  async requireProfileById(id: string): Promise<UserProfileRow> {
    const user = await this.findProfileById(id);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }
    return user;
  }

  async existsByEmail(email: string, excludeUserId: string): Promise<boolean> {
    const count = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: email.toLowerCase() })
      .andWhere('u.id != :id', { id: excludeUserId })
      .getCount();
    return count > 0;
  }

  async updateProfile(id: string, updates: ProfileUpdate): Promise<UserProfileRow> {
    await this.users.findOneOrFail({ where: { id }, select: { id: true } });

    // Only provided keys are written: undefined = leave alone, null = clear the column.
    // (Assigning null through save() on the entity is skipped by TypeORM, so use update().)
    const changes: QueryDeepPartialEntity<User> = {};
    if (updates.name !== undefined) changes.name = updates.name;
    if ('email' in updates) changes.email = updates.email as string;
    if ('dob' in updates) changes.dob = updates.dob as string;
    if ('gender' in updates) changes.gender = updates.gender as User['gender'];
    if ('bloodGroup' in updates) changes.bloodGroup = updates.bloodGroup as User['bloodGroup'];
    if ('heightCm' in updates) changes.heightCm = updates.heightCm as number;
    if ('weightKg' in updates) changes.weightKg = updates.weightKg as number;
    if ('avatarUrl' in updates) changes.avatarUrl = updates.avatarUrl as string;

    if (Object.keys(changes).length > 0) {
      try {
        await this.users.update(id, changes);
      } catch (error) {
        // Two accounts racing for one email: the unique index decides.
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException({
            code: 'EMAIL_TAKEN',
            message: 'This email address is already registered to another account.',
          });
        }
        throw error;
      }
    }
    return this.requireProfileById(id);
  }

  // ── Medical-history queries ────────────────────────────────────────────────

  findMedicalHistory(userId: string): Promise<MedicalHistory | null> {
    return this.histories.findOne({ where: { userId } });
  }

  async upsertMedicalHistory(
    userId: string,
    data: MedicalHistoryUpdate,
  ): Promise<MedicalHistory> {
    const existing = await this.histories.findOne({ where: { userId } });

    if (existing) {
      // Merge — only overwrite fields explicitly provided in data
      if (data.allergies !== undefined) existing.allergies = data.allergies;
      if (data.chronicConditions !== undefined)
        existing.chronicConditions = data.chronicConditions;
      if (data.pastSurgeries !== undefined) existing.pastSurgeries = data.pastSurgeries;
      if (data.currentMedications !== undefined)
        existing.currentMedications = data.currentMedications;
      if (data.familyHistory !== undefined) existing.familyHistory = data.familyHistory;
      if ('notes' in data) existing.notes = data.notes ?? undefined;

      return this.histories.save(existing);
    }

    const record = this.histories.create({
      userId,
      allergies: data.allergies,
      chronicConditions: data.chronicConditions,
      pastSurgeries: data.pastSurgeries,
      currentMedications: data.currentMedications,
      familyHistory: data.familyHistory,
      notes: data.notes ?? undefined,  // TypeORM DeepPartial doesn't accept null for optional string
    });
    return this.histories.save(record);
  }

  // ── Email uniqueness guard (called before update) ─────────────────────────

  async assertEmailAvailable(email: string, userId: string): Promise<void> {
    if (await this.existsByEmail(email, userId)) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'This email address is already registered to another account.',
      });
    }
  }
}
