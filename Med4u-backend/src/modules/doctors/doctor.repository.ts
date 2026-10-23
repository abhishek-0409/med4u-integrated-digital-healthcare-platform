import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor, ConsultationMode } from '../../database/entities/doctor.entity';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorListItem, DoctorDetailResponse } from './doctor.types';
import { resolveExperience } from './doctor-experience.util';
import { isPubliclyVisible, listableSql, stagingFixturesEnabled } from './doctor-eligibility';

export interface FindAllOptions {
  specialization?: string;
  search?: string;
  city?: string;
  minRating?: number;
  maxFee?: number;
  consultationMode?: ConsultationMode;
  sortBy: 'rating' | 'experience' | 'fee';
  skip: number;
  take: number;
}

@Injectable()
export class DoctorRepository {
  constructor(
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  findAll(opts: FindAllOptions): Promise<[Doctor[], number]> {
    const qb = this.doctors
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.user', 'u')
      .where('d.deletedAt IS NULL')
      // Publicly listed: verified doctors, plus clearly-labelled seeded demo profiles.
      .andWhere(listableSql('d', stagingFixturesEnabled()));

    if (opts.specialization) {
      qb.andWhere('LOWER(d.specialization) = :spec', {
        spec: opts.specialization.toLowerCase(),
      });
    }
    if (opts.search) {
      const escaped = opts.search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        '(LOWER(u.name) LIKE :q OR LOWER(d.specialization) LIKE :q OR LOWER(d.city) LIKE :q)',
        { q: `%${escaped}%` },
      );
    }
    if (opts.city) {
      qb.andWhere('LOWER(d.city) LIKE :city', {
        city: `%${opts.city.toLowerCase()}%`,
      });
    }
    if (opts.minRating !== undefined) {
      qb.andWhere('d.rating >= :minRating', { minRating: opts.minRating });
    }
    if (opts.maxFee !== undefined) {
      qb.andWhere('d.consultationFee <= :maxFee', { maxFee: opts.maxFee });
    }
    if (opts.consultationMode) {
      qb.andWhere('d.consultationMode = :mode', { mode: opts.consultationMode });
    }

    const orderMap = {
      experience: ['d.experienceYears', 'DESC'],
      fee: ['d.consultationFee', 'ASC'],
      rating: ['d.rating', 'DESC'],
    } as const;
    const [col, dir] = orderMap[opts.sortBy] ?? orderMap.rating;
    // Stable tie-breakers: ratings are all 0 until real reviews exist.
    qb.orderBy(col, dir).addOrderBy('d.experienceYears', 'DESC').addOrderBy('u.name', 'ASC').addOrderBy('d.id', 'ASC');

    return qb.skip(opts.skip).take(opts.take).getManyAndCount();
  }

  /** Distinct specializations of publicly listed doctors, alphabetical. */
  async listSpecializations(): Promise<string[]> {
    const rows = await this.doctors
      .createQueryBuilder('d')
      .select('d.specialization', 'specialization')
      .where('d.deletedAt IS NULL')
      .andWhere(listableSql('d', stagingFixturesEnabled()))
      .distinct(true)
      .orderBy('d.specialization', 'ASC')
      .getRawMany<{ specialization: string }>();
    return rows.map((r) => r.specialization);
  }

  findById(id: string): Promise<Doctor | null> {
    return this.doctors.findOne({ where: { id }, relations: ['user'] });
  }

  findByUserId(userId: string): Promise<Doctor | null> {
    return this.doctors.findOne({ where: { userId }, relations: ['user'] });
  }

  async requireById(id: string): Promise<Doctor> {
    const doctor = await this.findById(id);
    if (!doctor) {
      throw new NotFoundException({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found.' });
    }
    return doctor;
  }

  /** For public endpoints: profiles that are neither verified nor demo are treated as non-existent. */
  async requireVerifiedById(id: string): Promise<Doctor> {
    const doctor = await this.findById(id);
    if (!doctor || !isPubliclyVisible(doctor, stagingFixturesEnabled())) {
      throw new NotFoundException({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found.' });
    }
    return doctor;
  }

  async requireByUserId(userId: string): Promise<Doctor> {
    const doctor = await this.findByUserId(userId);
    if (!doctor) {
      throw new NotFoundException({
        code: 'DOCTOR_PROFILE_NOT_FOUND',
        message: 'Doctor profile not found.',
      });
    }
    return doctor;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(userId: string, dto: RegisterDoctorDto): Promise<Doctor> {
    const existing = await this.doctors.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException({
        code: 'DOCTOR_PROFILE_EXISTS',
        message: 'A doctor profile already exists for this account.',
      });
    }

    const doctor = this.doctors.create({
      userId,
      specialization: dto.specialization,
      licenseNumber: dto.licenseNumber,
      experienceYears: dto.experienceYears ?? 0,
      bio: dto.bio,
      consultationFee: dto.consultationFee ?? 0,
      languages: dto.languages,
      education: dto.education ?? [],
      availabilitySchedule: dto.availabilitySchedule ?? {},
      city: dto.city,
      consultationMode: dto.consultationMode ?? ConsultationMode.BOTH,
    });

    try {
      const saved = await this.doctors.save(doctor);
      // Reload with user relation for the response
      return this.requireById(saved.id);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'LICENSE_NUMBER_TAKEN',
          message: 'This license number is already registered.',
        });
      }
      throw err;
    }
  }

  async update(doctorId: string, dto: UpdateDoctorDto): Promise<Doctor> {
    const doctor = await this.doctors.findOneOrFail({ where: { id: doctorId } });

    if (dto.specialization !== undefined) doctor.specialization = dto.specialization;
    if ('bio' in dto) doctor.bio = dto.bio ?? undefined;
    if (dto.consultationFee !== undefined) doctor.consultationFee = dto.consultationFee;
    if (dto.languages !== undefined) doctor.languages = dto.languages;
    if (dto.education !== undefined) doctor.education = dto.education;
    if (dto.availabilitySchedule !== undefined)
      doctor.availabilitySchedule = dto.availabilitySchedule;
    if ('city' in dto) doctor.city = dto.city ?? undefined;
    if (dto.consultationMode !== undefined) doctor.consultationMode = dto.consultationMode;
    if (dto.isAvailableToday !== undefined) doctor.isAvailableToday = dto.isAvailableToday;

    await this.doctors.save(doctor);
    return this.requireById(doctorId);
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  toListItem(d: Doctor): DoctorListItem {
    return {
      id: d.id,
      name: d.user?.name ?? '',
      specialization: d.specialization,
      experienceYears: resolveExperience(d).years,
      bio: d.bio ?? null,
      consultationFee: d.consultationFee == null ? null : Number(d.consultationFee),
      languages: d.languages,
      rating: Number(d.rating),
      reviewCount: d.reviewCount,
      isVerified: d.isVerified,
      isDemo: d.isDemo,
      isStagingFixture: d.isStagingFixture ?? false,
      avatarUrl: d.user?.avatarUrl ?? null,
      gender: d.user?.gender ?? null,
      clinicName: d.clinicName ?? null,
      qualifications: (d.education ?? []).map((e) => e.degree),
      city: d.city ?? null,
      consultationMode: d.consultationMode,
      isAvailableToday: d.isAvailableToday,
      createdAt: d.createdAt,
    };
  }

  /** Public profile: everything except the licence number. */
  toPublicDetail(d: Doctor): DoctorDetailResponse {
    const { licenseNumber: _omit, ...rest } = this.toDetailResponse(d);
    void _omit;
    return rest;
  }

  toDetailResponse(d: Doctor): DoctorDetailResponse {
    return {
      ...this.toListItem(d),
      licenseNumber: d.licenseNumber,
      education: d.education,
      availabilitySchedule: d.availabilitySchedule,
      address: d.address ?? null,
      photoAttribution: d.photoAttribution ?? null,
      experienceBasis: resolveExperience(d).basis,
      experienceSource: d.isDemo ? null : (d.experienceSource ?? null),
      registration:
        !d.isDemo && d.registrationCouncil && d.registrationNumber
          ? { council: d.registrationCouncil, number: d.registrationNumber, year: d.registrationYear ?? null }
          : null,
      verification: {
        status: d.verificationStatus ?? 'unverified',
        verifiedAt: d.verifiedAt ?? null,
        method: d.verificationMethod ?? null,
      },
      source:
        !d.isDemo && d.profileSource
          ? {
              name: d.profileSource,
              url: d.profileSourceUrl ?? null,
              retrievedAt: d.profileSourceRetrievedAt ?? null,
            }
          : null,
      updatedAt: d.updatedAt,
    };
  }
}
