import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { getPaginationParams } from '../../common/utils/pagination.util';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { DoctorRepository } from './doctor.repository';
import { TimeSlotRepository } from './time-slot.repository';
import { isDemoAccountEmail } from '../auth/demo-doctor';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';
import {
  DoctorListItem,
  DoctorDetailResponse,
  DoctorSelfProfileResponse,
  TimeSlotResponse,
} from './doctor.types';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentStatus,
} from '../../database/entities/appointment.entity';
import { availabilityCacheKey } from '../appointments/appointment.service';
import {
  isWithinBookingWindow,
  todayInClinic,
  toHhMm,
  toInstant,
} from '../appointments/appointment-time.util';
import { isSlotInDoctorSchedule } from './time-slot.repository';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const CACHE_TTL_SEC = 3600;

@Injectable()
export class DoctorService {
  constructor(
    private readonly doctorRepo: DoctorRepository,
    private readonly slotRepo: TimeSlotRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  // ── GET /api/v1/doctors ────────────────────────────────────────────────────

  async list(query: ListDoctorsQueryDto): Promise<PaginatedResponse<DoctorListItem>> {
    const { page, limit, skip } = getPaginationParams(query);

    const cacheKey = `doctors:list:${JSON.stringify({ ...query, page, limit })}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as PaginatedResponse<DoctorListItem>;

    const [doctors, total] = await this.doctorRepo.findAll({
      specialization: query.specialization,
      search: query.search,
      city: query.city,
      minRating: query.minRating,
      maxFee: query.maxFee,
      consultationMode: query.consultationMode,
      sortBy: query.sortBy,
      skip,
      take: limit,
    });

    const result = new PaginatedResponse(
      doctors.map((d) => this.doctorRepo.toListItem(d)),
      total,
      page,
      limit,
    );

    await this.redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(result));
    return result;
  }

  // ── GET /api/v1/doctors/:id ────────────────────────────────────────────────

  async getById(id: string): Promise<DoctorDetailResponse> {
    const cacheKey = `doctors:detail:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as DoctorDetailResponse;

    const doctor = await this.doctorRepo.requireVerifiedById(id);
    const result = this.doctorRepo.toPublicDetail(doctor);

    await this.redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(result));
    return result;
  }

  // ── GET /api/v1/doctors/:id/availability ──────────────────────────────────

  async getAvailability(doctorId: string, date: string): Promise<TimeSlotResponse[]> {
    const doctor = await this.doctorRepo.requireVerifiedById(doctorId);
    const today = todayInClinic();
    if (!isWithinBookingWindow(date, today)) return [];

    // A payment hold must not keep the slot blocked past its 12-minute reservation window.
    const expiredHolds = await this.appointments
      .createQueryBuilder('a')
      .innerJoin('a.slot', 'slot')
      .select(['a.id', 'a.slotId'])
      .where('a.doctorId = :doctorId', { doctorId })
      .andWhere('slot.date = :date', { date })
      .andWhere('a.status = :status', { status: AppointmentStatus.PENDING })
      .andWhere('a.paymentStatus = :paymentStatus', {
        paymentStatus: AppointmentPaymentStatus.PENDING,
      })
      .andWhere('a.paymentExpiresAt < :now', { now: new Date() })
      .getMany();
    if (expiredHolds.length) {
      await this.appointments.manager.transaction(async (em) => {
        for (const holdRef of expiredHolds) {
          const hold = await em.findOne(Appointment, {
            where: { id: holdRef.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            !hold ||
            hold.status !== AppointmentStatus.PENDING ||
            hold.paymentStatus !== AppointmentPaymentStatus.PENDING ||
            !hold.paymentExpiresAt ||
            hold.paymentExpiresAt > new Date()
          )
            continue;
          const slot = await em.findOne(TimeSlot, {
            where: { id: hold.slotId },
            lock: { mode: 'pessimistic_write' },
          });
          hold.status = AppointmentStatus.CANCELLED;
          hold.paymentStatus = AppointmentPaymentStatus.EXPIRED;
          await em.save(hold);
          if (slot) await em.update(TimeSlot, slot.id, { isBooked: false });
        }
      });
      await this.redis.del(availabilityCacheKey(doctorId, date));
    }

    const weekday = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
    if (!doctor.availabilitySchedule?.[weekday]) return [];

    // The cache holds raw slots (kept fresh by booking/cancelling); "is it still in the future?"
    // is time-dependent, so it is computed per request.
    const cacheKey = availabilityCacheKey(doctorId, date);
    const cached = await this.redis.get(cacheKey);
    let slots: TimeSlot[];
    if (cached) {
      slots = JSON.parse(cached) as TimeSlot[];
    } else {
      await this.slotRepo.ensureSlotsForDate(doctor, date);
      slots = await this.slotRepo.findByDoctorAndDate(doctorId, date);
      await this.redis.setex(cacheKey, 300, JSON.stringify(slots));
    }

    const now = Date.now();
    const takingBookings = date !== today || doctor.isAvailableToday;
    const occupied = await this.slotRepo.findOccupiedIntervals(doctorId, date);
    const minutes = (time: string): number => {
      const [hours, mins] = toHhMm(time).split(':').map(Number);
      return hours * 60 + mins;
    };
    return slots
      .filter((s) => isSlotInDoctorSchedule(doctor, date, s.startTime, s.endTime))
      .map((s) => {
        const startsInFuture = toInstant(date, s.startTime).getTime() > now;
        const overlapsAppointment = occupied.some(
          (used) =>
            minutes(s.startTime) < minutes(used.endTime) &&
            minutes(used.startTime) < minutes(s.endTime),
        );
        return this.slotRepo.toResponse(
          s,
          takingBookings && !s.isBooked && startsInFuture && !overlapsAppointment,
        );
      });
  }

  // ── GET /api/v1/doctors/specializations ───────────────────────────────────

  async listSpecializations(): Promise<string[]> {
    // The key sits under doctors:list:* so doctor changes invalidate it with the list cache.
    const cacheKey = 'doctors:list:specializations';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];

    const result = await this.doctorRepo.listSpecializations();
    await this.redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(result));
    return result;
  }

  // ── POST /api/v1/doctors/register ─────────────────────────────────────────

  async register(userId: string, dto: RegisterDoctorDto): Promise<DoctorDetailResponse> {
    const doctor = await this.doctorRepo.create(userId, dto);
    await this.invalidateDoctorListCache();
    return this.doctorRepo.toDetailResponse(doctor);
  }

  // ── PATCH /api/v1/doctors/me ──────────────────────────────────────────────

  async updateMe(userId: string, dto: UpdateDoctorDto): Promise<DoctorDetailResponse> {
    const doctor = await this.doctorRepo.requireByUserId(userId);
    const updated = await this.doctorRepo.update(doctor.id, dto);

    await Promise.all([
      this.redis.del(`doctors:detail:${doctor.id}`),
      this.invalidateDoctorListCache(),
      ...(dto.availabilitySchedule !== undefined
        ? [this.invalidateDoctorAvailabilityCache(doctor.id)]
        : []),
    ]);

    return this.doctorRepo.toDetailResponse(updated);
  }

  /** Resolve the signed-in doctor's linked profile without accepting a profile id from the client. */
  async getSelfProfile(userId: string): Promise<DoctorSelfProfileResponse> {
    const doctor = await this.doctorRepo.requireByUserId(userId);
    const hasRegistration = Boolean(
      doctor.registrationCouncil?.trim() && doctor.registrationNumber?.trim(),
    );
    return {
      id: doctor.id,
      userId: doctor.userId,
      name: doctor.user?.name ?? '',
      specialization: doctor.specialization,
      isVerified: doctor.isVerified,
      isDemo: doctor.isDemo,
      isStagingFixture: doctor.isStagingFixture ?? false,
      isDemoAccount: isDemoAccountEmail(doctor.user?.email),
      verification: { status: doctor.verificationStatus ?? 'unverified' },
      availabilitySchedule: doctor.availabilitySchedule ?? {},
      // Do not return the license number or registration number to the mobile app.
      licenseStatus: doctor.licenseNumber?.trim() ? 'provided' : 'missing',
      registrationStatus: hasRegistration ? 'provided' : 'not_provided',
    };
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────

  async invalidateDoctorListCache(): Promise<void> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await this.redis.scan(cursor, 'MATCH', 'doctors:list:*', 'COUNT', 100);
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) await this.redis.del(keys);
  }

  private async invalidateDoctorAvailabilityCache(doctorId: string): Promise<void> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await this.redis.scan(
        cursor,
        'MATCH',
        `doctors:avail:${doctorId}:*`,
        'COUNT',
        100,
      );
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) await this.redis.del(keys);
  }
}
