import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentStatus,
  AppointmentType,
} from '../../database/entities/appointment.entity';
import { ConsultationMode, Doctor } from '../../database/entities/doctor.entity';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import { isSlotInDoctorSchedule } from '../doctors/time-slot.repository';
import { User, UserRole } from '../../database/entities/user.entity';
import {
  bookableWhere,
  isStagingAccount,
  stagingFixturesEnabled,
} from '../doctors/doctor-eligibility';
import { getPaginationParams, PaginatedResponse } from '../../common/utils/pagination.util';
import { AppointmentResponse } from './appointment.types';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { CreatePaymentOrderDto, VerifyAppointmentPaymentDto } from './dto/create-payment-order.dto';
import {
  DEMO_DOCTOR_LICENSE,
  demoDoctorVideoEnabled,
  isDemoVideoTestParticipant,
} from '../auth/demo-doctor';
import { RazorpayService } from './razorpay.service';
import {
  canCancelAppointment,
  canJoinConsultation,
  CLINIC_TIME_ZONE,
  MAX_ADVANCE_DAYS,
  isWithinBookingWindow,
  toHhMm,
  toInstant,
  todayInClinic,
} from './appointment-time.util';

const LIVE_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
const PG_UNIQUE_VIOLATION = '23505';

/** Must match the key written by DoctorService.getAvailability. */
export const availabilityCacheKey = (doctorId: string, date: string): string =>
  `doctors:avail:${doctorId}:${date}`;

const slotDate = (slot: TimeSlot): string => slot.date;

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly razorpay: RazorpayService,
  ) {}

  paymentConfiguration(): { enabled: boolean; keyId?: string } {
    return this.razorpay.configuration;
  }

  /** Reserves a slot briefly and creates the gateway order using the server fee snapshot. */
  async createPaymentOrder(patientId: string, dto: CreatePaymentOrderDto) {
    const config = this.razorpay.configuration;
    if (!config.enabled || !config.keyId) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: 'Online appointment payments are not configured.',
      });
    }

    let reservation: {
      id: string;
      doctorId: string;
      date: string;
      fee: number;
      existingOrderId?: string;
    };
    try {
      reservation = await this.dataSource.transaction(async (em) => {
        const slot = await em.findOne(TimeSlot, {
          where: { id: dto.slotId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!slot || slot.doctorId !== dto.doctorId) {
          throw new NotFoundException({
            code: 'SLOT_NOT_FOUND',
            message: 'That time slot does not exist.',
          });
        }

        // Expired payment holds are released when this slot is requested again.
        const expired = await em.find(Appointment, {
          where: {
            slotId: slot.id,
            status: AppointmentStatus.PENDING,
            paymentStatus: AppointmentPaymentStatus.PENDING,
          },
          lock: { mode: 'pessimistic_write' },
        });
        const now = new Date();
        for (const hold of expired) {
          if (hold.paymentExpiresAt && hold.paymentExpiresAt <= now) {
            hold.status = AppointmentStatus.CANCELLED;
            hold.paymentStatus = AppointmentPaymentStatus.EXPIRED;
            await em.save(hold);
            await em.update(TimeSlot, slot.id, { isBooked: false });
            slot.isBooked = false;
          }
        }

        const doctor = await em.findOne(Doctor, {
          where: bookableWhere(dto.doctorId, stagingFixturesEnabled()),
        });
        if (!doctor)
          throw new NotFoundException({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found.' });
        await this.assertStagingDoctorAccess(em, doctor, patientId);
        if (doctor.isDemo) {
          throw new BadRequestException({
            code: 'DEMO_BOOKING_REQUIRED',
            message: 'Demo doctor profiles use the no-charge demo booking flow.',
          });
        }
        if (doctor.userId === patientId) {
          throw new BadRequestException({
            code: 'CANNOT_BOOK_SELF',
            message: 'You cannot book an appointment with yourself.',
          });
        }
        const type = this.resolveType(doctor.consultationMode, dto.type);
        const date = slotDate(slot);
        if (!isSlotInDoctorSchedule(doctor, date, slot.startTime, slot.endTime))
          throw this.slotUnavailable();
        const start = toInstant(date, slot.startTime);
        if (start.getTime() <= now.getTime()) {
          throw new BadRequestException({
            code: 'SLOT_IN_PAST',
            message: 'That time slot has already started. Please pick a later one.',
          });
        }
        if (!isWithinBookingWindow(date, todayInClinic(now))) {
          throw new BadRequestException({
            code: 'SLOT_TOO_FAR',
            message: `Appointments can only be booked up to ${MAX_ADVANCE_DAYS} days ahead.`,
          });
        }
        const activeHold = await em.findOne(Appointment, {
          where: {
            patientId,
            slotId: slot.id,
            status: AppointmentStatus.PENDING,
            paymentStatus: AppointmentPaymentStatus.PENDING,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (activeHold && activeHold.paymentExpiresAt && activeHold.paymentExpiresAt > now) {
          if (!activeHold.razorpayOrderId) {
            throw new ConflictException({
              code: 'PAYMENT_ORDER_INITIALIZING',
              message: 'Payment setup is still in progress. Please retry shortly.',
            });
          }
          return {
            id: activeHold.id,
            doctorId: doctor.id,
            date,
            fee: Number(activeHold.consultationFee),
            existingOrderId: activeHold.razorpayOrderId,
          };
        }
        if (slot.isBooked) throw this.slotUnavailable();
        if (
          await em.exists(Appointment, {
            where: { patientId, appointmentDate: start, status: In(LIVE_STATUSES) },
          })
        ) {
          throw new ConflictException({
            code: 'PATIENT_DOUBLE_BOOKED',
            message: 'You already have an appointment at that time.',
          });
        }

        const fee = Number(doctor.consultationFee);
        if (!Number.isFinite(fee) || fee <= 0 || Math.round(fee * 100) < 1) {
          throw new ServiceUnavailableException({
            code: 'INVALID_CONSULTATION_FEE',
            message: 'This doctor cannot be booked online right now.',
          });
        }
        const expiresAt = new Date(now.getTime() + 12 * 60 * 1000);
        const saved = await em.save(
          em.create(Appointment, {
            patientId,
            doctorId: doctor.id,
            slotId: slot.id,
            appointmentDate: start,
            type,
            status: AppointmentStatus.PENDING,
            paymentStatus: AppointmentPaymentStatus.PENDING,
            consultationFee: fee,
            paymentExpiresAt: expiresAt,
            notes: dto.notes,
          }),
        );
        await em.update(TimeSlot, slot.id, { isBooked: true });
        return { id: saved.id, doctorId: doctor.id, date, fee };
      });
    } catch (err) {
      this.mapBookingConflict(err);
      throw err;
    }

    await this.redis.del(availabilityCacheKey(reservation.doctorId, reservation.date));
    if (reservation.existingOrderId) {
      return {
        appointment: await this.getForUser(patientId, UserRole.PATIENT, reservation.id),
        keyId: config.keyId,
        orderId: reservation.existingOrderId,
        amount: Math.round(reservation.fee * 100),
        currency: 'INR',
      };
    }
    try {
      const order = await this.razorpay.createOrder(
        Math.round(reservation.fee * 100),
        reservation.id,
      );
      if (
        order.currency !== 'INR' ||
        order.amount !== Math.round(reservation.fee * 100) ||
        order.status !== 'created'
      ) {
        throw new ServiceUnavailableException({
          code: 'PAYMENT_ORDER_INVALID',
          message: 'The payment provider returned an invalid order.',
        });
      }
      await this.appointments.update(reservation.id, { razorpayOrderId: order.id });
      return {
        appointment: await this.getForUser(patientId, UserRole.PATIENT, reservation.id),
        keyId: config.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      };
    } catch (error) {
      await this.releasePaymentHold(reservation.id, AppointmentPaymentStatus.FAILED);
      await this.redis.del(availabilityCacheKey(reservation.doctorId, reservation.date));
      throw error;
    }
  }

  async verifyPayment(patientId: string, appointmentId: string, dto: VerifyAppointmentPaymentDto) {
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, patientId },
    });
    if (!appointment) throw this.appointmentNotFound();
    if (
      appointment.paymentStatus === 'PAID' &&
      appointment.razorpayPaymentId === dto.razorpayPaymentId
    ) {
      return this.getForUser(patientId, UserRole.PATIENT, appointmentId);
    }
    if (!appointment.razorpayOrderId || appointment.razorpayOrderId !== dto.razorpayOrderId) {
      throw new UnauthorizedException({
        code: 'PAYMENT_ORDER_MISMATCH',
        message: 'Payment does not match this appointment.',
      });
    }
    if (
      !this.razorpay.verifyCheckoutSignature(
        dto.razorpayOrderId,
        dto.razorpayPaymentId,
        dto.razorpaySignature,
      )
    ) {
      throw new UnauthorizedException({
        code: 'PAYMENT_SIGNATURE_INVALID',
        message: 'Payment verification failed.',
      });
    }

    const payment = await this.razorpay.fetchPayment(dto.razorpayPaymentId);
    const amount = Math.round(Number(appointment.consultationFee) * 100);
    if (
      payment.id !== dto.razorpayPaymentId ||
      payment.order_id !== appointment.razorpayOrderId ||
      payment.amount !== amount ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_CAPTURED',
        message: 'Payment has not been captured for the expected amount.',
      });
    }
    if (appointment.paymentStatus === AppointmentPaymentStatus.PAID) {
      await this.refundCapturedPayment(appointment.id, payment.id, amount);
      throw new ConflictException({
        code: 'DUPLICATE_PAYMENT_REFUNDED',
        message: 'A duplicate payment was detected and is being refunded.',
      });
    }
    if (
      appointment.paymentStatus !== AppointmentPaymentStatus.PENDING ||
      appointment.status !== AppointmentStatus.PENDING
    ) {
      await this.refundCapturedPayment(appointment.id, payment.id, amount);
      throw new ConflictException({
        code: 'PAYMENT_RESERVATION_CLOSED',
        message: 'The reservation closed. The captured payment is being refunded.',
      });
    }

    if (!appointment.paymentExpiresAt || appointment.paymentExpiresAt <= new Date()) {
      await this.releasePaymentHold(appointmentId, AppointmentPaymentStatus.EXPIRED);
      await this.refundCapturedPayment(appointmentId, payment.id, amount);
      throw new ConflictException({
        code: 'PAYMENT_HOLD_EXPIRED',
        message: 'The reservation expired. The captured payment is being refunded.',
      });
    }

    let duplicateCapturedPayment = false;
    await this.dataSource.transaction(async (em) => {
      const locked = await em.findOne(Appointment, {
        where: { id: appointmentId, patientId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw this.appointmentNotFound();
      if (locked.paymentStatus === AppointmentPaymentStatus.PAID) {
        duplicateCapturedPayment = locked.razorpayPaymentId !== payment.id;
        return;
      }
      if (locked.paymentStatus !== 'PENDING' || locked.status !== AppointmentStatus.PENDING) {
        throw new ConflictException({
          code: 'PAYMENT_RESERVATION_CLOSED',
          message: 'This payment reservation is no longer active.',
        });
      }
      locked.paymentStatus = AppointmentPaymentStatus.PAID;
      locked.razorpayPaymentId = payment.id;
      locked.status = AppointmentStatus.CONFIRMED;
      await em.save(locked);
    });
    if (duplicateCapturedPayment) {
      await this.refundCapturedPayment(appointmentId, payment.id, amount);
      throw new ConflictException({
        code: 'DUPLICATE_PAYMENT_REFUNDED',
        message: 'A duplicate payment was detected and is being refunded.',
      });
    }
    return this.getForUser(patientId, UserRole.PATIENT, appointmentId);
  }

  async cancelPaymentReservation(patientId: string, appointmentId: string): Promise<void> {
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, patientId },
    });
    if (!appointment) throw this.appointmentNotFound();
    await this.releasePaymentHold(appointmentId, AppointmentPaymentStatus.EXPIRED);
  }

  async handlePaymentWebhook(rawBody?: Buffer, signature?: string): Promise<{ received: true }> {
    if (!rawBody || !signature || !this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException({
        code: 'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
        message: 'Invalid webhook signature.',
      });
    }
    let event: {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
            currency?: string;
            status?: string;
          };
        };
      };
    };
    try {
      event = JSON.parse(rawBody.toString('utf8')) as typeof event;
    } catch {
      throw new BadRequestException({
        code: 'PAYMENT_WEBHOOK_INVALID',
        message: 'Invalid webhook payload.',
      });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.id || !payment.order_id) return { received: true };
    const appointment = await this.appointments.findOne({
      where: { razorpayOrderId: payment.order_id },
    });
    if (!appointment) return { received: true };
    const amount = Math.round(Number(appointment.consultationFee) * 100);
    const validPayment = payment.amount === amount && payment.currency === 'INR';

    if (event.event === 'payment.captured') {
      if (!validPayment || payment.status !== 'captured') {
        throw new ConflictException({
          code: 'PAYMENT_WEBHOOK_MISMATCH',
          message: 'Captured payment does not match the appointment order.',
        });
      }
      if (appointment.paymentStatus === AppointmentPaymentStatus.PAID) {
        if (appointment.razorpayPaymentId !== payment.id)
          await this.refundCapturedPayment(appointment.id, payment.id, Number(payment.amount));
        return { received: true };
      }
      if (
        appointment.paymentStatus !== AppointmentPaymentStatus.PENDING ||
        appointment.status !== AppointmentStatus.PENDING
      ) {
        await this.refundCapturedPayment(appointment.id, payment.id, Number(payment.amount));
        return { received: true };
      }
      if (!appointment.paymentExpiresAt || appointment.paymentExpiresAt <= new Date()) {
        await this.releasePaymentHold(appointment.id, AppointmentPaymentStatus.EXPIRED);
        await this.refundCapturedPayment(appointment.id, payment.id, amount);
        return { received: true };
      }
      let duplicateCapturedPayment = false;
      await this.dataSource.transaction(async (em) => {
        const locked = await em.findOne(Appointment, {
          where: { id: appointment.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) return;
        if (locked.paymentStatus === AppointmentPaymentStatus.PAID) {
          duplicateCapturedPayment = locked.razorpayPaymentId !== payment.id;
          return;
        }
        if (locked.paymentStatus !== 'PENDING' || locked.status !== AppointmentStatus.PENDING)
          return;
        locked.paymentStatus = AppointmentPaymentStatus.PAID;
        locked.razorpayPaymentId = payment.id;
        locked.status = AppointmentStatus.CONFIRMED;
        await em.save(locked);
      });
      if (duplicateCapturedPayment)
        await this.refundCapturedPayment(appointment.id, payment.id, Number(payment.amount));
    } else if (event.event === 'payment.failed' && appointment.paymentStatus === 'PENDING') {
      await this.releasePaymentHold(appointment.id, AppointmentPaymentStatus.FAILED);
    }
    return { received: true };
  }

  private async releasePaymentHold(
    appointmentId: string,
    paymentStatus: AppointmentPaymentStatus.FAILED | AppointmentPaymentStatus.EXPIRED,
  ): Promise<void> {
    const result = await this.dataSource.transaction(async (em) => {
      const appt = await em.findOne(Appointment, {
        where: { id: appointmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appt || appt.paymentStatus !== 'PENDING') return null;
      const slot = await em.findOne(TimeSlot, {
        where: { id: appt.slotId },
        lock: { mode: 'pessimistic_write' },
      });
      appt.paymentStatus = paymentStatus;
      appt.status = AppointmentStatus.CANCELLED;
      await em.save(appt);
      if (slot) {
        await em.update(TimeSlot, slot.id, { isBooked: false });
        return { doctorId: slot.doctorId, date: slot.date };
      }
      return null;
    });
    if (result) await this.redis.del(availabilityCacheKey(result.doctorId, result.date));
  }

  private async expireStalePaymentHolds(): Promise<void> {
    const expired = await this.appointments
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.status = :status', { status: AppointmentStatus.PENDING })
      .andWhere('a.paymentStatus = :paymentStatus', {
        paymentStatus: AppointmentPaymentStatus.PENDING,
      })
      .andWhere('a.paymentExpiresAt < :now', { now: new Date() })
      .getRawMany<{ id: string }>();
    await Promise.all(
      expired.map(({ id }) => this.releasePaymentHold(id, AppointmentPaymentStatus.EXPIRED)),
    );
  }

  /** Persist refund intent before the gateway call so duplicate webhooks cannot refund twice. */
  private async refundCapturedPayment(
    appointmentId: string,
    paymentId: string,
    amountPaise: number,
    allowAlreadyPaidSamePayment = false,
  ): Promise<void> {
    const shouldSubmit = await this.dataSource.transaction(async (em) => {
      const appointment = await em.findOne(Appointment, {
        where: { id: appointmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appointment) return false;
      if (
        appointment.paymentStatus === AppointmentPaymentStatus.REFUND_PENDING ||
        appointment.paymentStatus === AppointmentPaymentStatus.REFUNDED ||
        (!allowAlreadyPaidSamePayment &&
          appointment.paymentStatus === AppointmentPaymentStatus.PAID &&
          appointment.razorpayPaymentId === paymentId)
      ) {
        return false;
      }
      if (appointment.paymentStatus !== AppointmentPaymentStatus.PAID) {
        appointment.razorpayPaymentId = paymentId;
      }
      appointment.paymentStatus = AppointmentPaymentStatus.REFUND_PENDING;
      await em.save(appointment);
      return true;
    });
    if (!shouldSubmit) return;

    try {
      await this.razorpay.refund(paymentId, amountPaise);
      await this.appointments.update(appointmentId, {
        paymentStatus: AppointmentPaymentStatus.REFUNDED,
      });
    } catch {
      // Keep REFUND_PENDING for operational reconciliation; never send a duplicate refund blindly.
      throw new ServiceUnavailableException({
        code: 'REFUND_PENDING',
        message:
          'Payment was captured but the refund needs to be reconciled. Please contact support.',
      });
    }
  }

  private mapBookingConflict(err: unknown): void {
    const pg = err as { code?: string; constraint?: string };
    if (pg.code === PG_UNIQUE_VIOLATION) {
      throw pg.constraint === 'UQ_appointments_patient_active_time'
        ? new ConflictException({
            code: 'PATIENT_DOUBLE_BOOKED',
            message: 'You already have an appointment at that time.',
          })
        : this.slotUnavailable();
    }
    if (pg.code === '23P01' && pg.constraint === 'EX_appointments_doctor_interval')
      throw this.slotUnavailable();
  }

  // ── POST /v1/appointments ──────────────────────────────────────────────────

  /**
   * Books a slot for the authenticated patient.
   *
   * Double booking is prevented in three layers:
   *  1. the slot row is locked (SELECT … FOR UPDATE) for the whole transaction, so concurrent
   *     bookings of one slot are serialised and the loser sees is_booked = true;
   *  2. the partial unique index UQ_appointments_active_slot rejects a second live appointment
   *     for the same slot even if the lock were bypassed;
   *  3. UQ_appointments_patient_active_time stops one patient holding two live appointments
   *     at the same instant.
   */
  async create(patientId: string, dto: CreateAppointmentDto): Promise<AppointmentResponse> {
    return this.createBooking(patientId, dto, false);
  }

  /** Creates a no-charge booking only for a server-identified demo doctor. */
  async createDemoBooking(
    patientId: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.createBooking(patientId, dto, true);
  }

  private async createBooking(
    patientId: string,
    dto: CreateAppointmentDto,
    demoOnly: boolean,
  ): Promise<AppointmentResponse> {
    let created: { id: string; doctorId: string; date: string };
    try {
      created = await this.dataSource.transaction(async (em) => {
        const slot = await em.findOne(TimeSlot, {
          where: { id: dto.slotId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!slot || slot.doctorId !== dto.doctorId) {
          throw new NotFoundException({
            code: 'SLOT_NOT_FOUND',
            message: 'That time slot does not exist.',
          });
        }

        const doctor = await em.findOne(Doctor, {
          where: demoOnly
            ? { id: dto.doctorId, isDemo: true }
            : bookableWhere(dto.doctorId, stagingFixturesEnabled()),
        });
        if (!doctor) {
          throw new NotFoundException({ code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found.' });
        }
        await this.assertStagingDoctorAccess(em, doctor, patientId);
        await this.assertDemoVideoPatientAccess(em, doctor, patientId);
        if (doctor.userId === patientId) {
          throw new BadRequestException({
            code: 'CANNOT_BOOK_SELF',
            message: 'You cannot book an appointment with yourself.',
          });
        }

        if (doctor.consultationFee == null) {
          // "Not provided" must never be booked as a free consultation.
          throw new ConflictException({
            code: 'DOCTOR_FEE_NOT_SET',
            message:
              'This doctor has not published a consultation fee, so online booking is unavailable.',
          });
        }

        const type = this.resolveType(doctor.consultationMode, dto.type);
        const date = slotDate(slot);
        if (!isSlotInDoctorSchedule(doctor, date, slot.startTime, slot.endTime)) {
          throw this.slotUnavailable();
        }
        const start = toInstant(date, slot.startTime);
        const now = new Date();

        if (start.getTime() <= now.getTime()) {
          throw new BadRequestException({
            code: 'SLOT_IN_PAST',
            message: 'That time slot has already started. Please pick a later one.',
          });
        }
        if (!isWithinBookingWindow(date, todayInClinic(now))) {
          throw new BadRequestException({
            code: 'SLOT_TOO_FAR',
            message: `Appointments can only be booked up to ${MAX_ADVANCE_DAYS} days ahead.`,
          });
        }
        if (slot.isBooked) {
          throw this.slotUnavailable();
        }

        const clash = await em.exists(Appointment, {
          where: { patientId, appointmentDate: start, status: In(LIVE_STATUSES) },
        });
        if (clash) {
          throw new ConflictException({
            code: 'PATIENT_DOUBLE_BOOKED',
            message: 'You already have an appointment at that time.',
          });
        }

        const saved = await em.save(
          em.create(Appointment, {
            patientId,
            doctorId: doctor.id,
            slotId: slot.id,
            appointmentDate: start,
            type,
            status: AppointmentStatus.CONFIRMED,
            consultationFee: Number(doctor.consultationFee),
            paymentStatus: AppointmentPaymentStatus.NOT_REQUIRED,
            notes: dto.notes,
          }),
        );
        await em.update(TimeSlot, slot.id, { isBooked: true });
        return { id: saved.id, doctorId: doctor.id, date };
      });
    } catch (err) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === PG_UNIQUE_VIOLATION) {
        throw pg.constraint === 'UQ_appointments_patient_active_time'
          ? new ConflictException({
              code: 'PATIENT_DOUBLE_BOOKED',
              message: 'You already have an appointment at that time.',
            })
          : this.slotUnavailable();
      }
      if (pg.code === '23P01' && pg.constraint === 'EX_appointments_doctor_interval') {
        throw this.slotUnavailable();
      }
      throw err;
    }

    await this.redis.del(availabilityCacheKey(created.doctorId, created.date));
    return this.getForUser(patientId, UserRole.PATIENT, created.id);
  }

  // ── GET /v1/appointments ───────────────────────────────────────────────────

  async list(
    userId: string,
    role: UserRole,
    query: ListAppointmentsQueryDto,
  ): Promise<PaginatedResponse<AppointmentResponse>> {
    await this.expireStalePaymentHolds();
    const { page, limit, skip } = getPaginationParams(query);
    const qb = this.baseQuery(userId, role);

    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }

    // "Ended" is computed in SQL from the slot's IST wall-clock end time.
    const ended = `((slot.date + slot.endTime) AT TIME ZONE '${CLINIC_TIME_ZONE}') < NOW()`;
    if (query.scope === 'upcoming') {
      qb.andWhere('a.status IN (:...live)', { live: LIVE_STATUSES }).andWhere(`NOT ${ended}`);
      qb.orderBy('a.appointmentDate', 'ASC');
    } else {
      if (query.scope === 'past') {
        qb.andWhere(`(a.status NOT IN (:...live) OR ${ended})`, { live: LIVE_STATUSES });
      }
      qb.orderBy('a.appointmentDate', 'DESC');
    }

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const viewerIsDoctor = role === UserRole.DOCTOR;
    return new PaginatedResponse(
      rows.map((a) => this.toResponse(a, viewerIsDoctor)),
      total,
      page,
      limit,
    );
  }

  // ── GET /v1/appointments/:id ───────────────────────────────────────────────

  /** Returns 404 both for unknown ids and for other people's appointments. */
  async getForUser(userId: string, role: UserRole, id: string): Promise<AppointmentResponse> {
    await this.expireStalePaymentHolds();
    const appt = await this.baseQuery(userId, role).andWhere('a.id = :id', { id }).getOne();
    if (!appt) {
      throw this.appointmentNotFound();
    }
    return this.toResponse(appt, role === UserRole.DOCTOR);
  }

  // ── PATCH /v1/appointments/:id/cancel ──────────────────────────────────────

  async cancel(
    userId: string,
    role: UserRole,
    id: string,
    dto: CancelAppointmentDto,
  ): Promise<AppointmentResponse> {
    const { doctorId, date, refund } = await this.dataSource.transaction(async (em) => {
      const appt = await em.findOne(Appointment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const doctor = appt ? await em.findOne(Doctor, { where: { id: appt.doctorId } }) : null;
      // Authorisation comes from the database row, never from the request.
      if (!appt || !doctor || (appt.patientId !== userId && doctor.userId !== userId)) {
        throw this.appointmentNotFound();
      }

      const slot = await em.findOneOrFail(TimeSlot, { where: { id: appt.slotId } });
      const view = {
        status: appt.status,
        type: appt.type,
        date: slotDate(slot),
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
      // A repeated cancellation is safe and returns the already-cancelled booking.
      if (appt.status === AppointmentStatus.CANCELLED) {
        return {
          doctorId: doctor.id,
          date: slotDate(slot),
          refund:
            appt.paymentStatus === AppointmentPaymentStatus.PAID && appt.razorpayPaymentId
              ? {
                  paymentId: appt.razorpayPaymentId,
                  amount: Math.round(Number(appt.consultationFee) * 100),
                }
              : undefined,
        };
      }
      if (!canCancelAppointment(view)) {
        throw new ConflictException({
          code: 'CANNOT_CANCEL',
          message: LIVE_STATUSES.includes(appt.status)
            ? "This appointment has already started, so it can't be cancelled."
            : `This appointment is already ${appt.status}.`,
        });
      }

      appt.status = AppointmentStatus.CANCELLED;
      if (appt.paymentStatus === AppointmentPaymentStatus.PENDING) {
        appt.paymentStatus = AppointmentPaymentStatus.EXPIRED;
      }
      appt.cancellationReason = dto.reason;
      await em.save(appt);
      await em.update(TimeSlot, slot.id, { isBooked: false });
      return {
        doctorId: doctor.id,
        date: slotDate(slot),
        refund:
          appt.paymentStatus === AppointmentPaymentStatus.PAID && appt.razorpayPaymentId
            ? {
                paymentId: appt.razorpayPaymentId,
                amount: Math.round(Number(appt.consultationFee) * 100),
              }
            : undefined,
      };
    });

    await this.redis.del(availabilityCacheKey(doctorId, date));
    if (refund) {
      await this.refundCapturedPayment(id, refund.paymentId, refund.amount, true);
    }
    return this.getForUser(userId, role, id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Appointments visible to the viewer: their own as patient, or their doctor profile's. */
  private baseQuery(userId: string, role: UserRole): SelectQueryBuilder<Appointment> {
    const qb = this.appointments
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.slot', 'slot')
      .innerJoinAndSelect('a.doctor', 'doctor')
      .innerJoinAndSelect('doctor.user', 'doctorUser')
      .innerJoinAndSelect('a.patient', 'appointmentPatient');

    if (role === UserRole.DOCTOR) {
      return qb
        .innerJoinAndSelect('a.patient', 'patient')
        .where('doctor.userId = :userId', { userId });
    }
    return qb.where('a.patientId = :userId', { userId });
  }

  private resolveType(mode: ConsultationMode, requested?: AppointmentType): AppointmentType {
    const offersVideo = mode !== ConsultationMode.OFFLINE;
    const offersInPerson = mode !== ConsultationMode.ONLINE;
    const type = requested ?? (offersVideo ? AppointmentType.VIDEO : AppointmentType.IN_PERSON);
    const supported = type === AppointmentType.VIDEO ? offersVideo : offersInPerson;
    if (!supported) {
      throw new BadRequestException({
        code: 'MODE_NOT_SUPPORTED',
        message:
          type === AppointmentType.VIDEO
            ? 'This doctor does not offer video consultations.'
            : 'This doctor does not offer in-person consultations.',
      });
    }
    return type;
  }

  /** A staging test doctor may be booked only by staging test accounts, so real users can never reach it. */
  private async assertStagingDoctorAccess(
    em: import('typeorm').EntityManager,
    doctor: Doctor,
    patientId: string,
  ): Promise<void> {
    if (!doctor.isStagingFixture) return;
    const patient = await em.findOne(User, {
      where: { id: patientId },
      select: { id: true, email: true },
    });
    if (!isStagingAccount(patient?.email)) {
      throw new ForbiddenException({
        code: 'STAGING_DOCTOR_RESTRICTED',
        message: 'This staging test doctor can only be booked by staging test accounts.',
      });
    }
  }

  /** Keep calls with the login doctor inside an explicitly opted-in local synthetic patient account. */
  private async assertDemoVideoPatientAccess(
    em: import('typeorm').EntityManager,
    doctor: Doctor,
    patientId: string,
  ): Promise<void> {
    if (doctor.licenseNumber !== DEMO_DOCTOR_LICENSE) return;
    const patient = await em.findOne(User, {
      where: { id: patientId },
      select: { id: true },
    });
    if (
      !demoDoctorVideoEnabled() ||
      !patient ||
      !isDemoVideoTestParticipant(doctor, patient.id)
    ) {
      throw new ForbiddenException({
        code: 'DEMO_VIDEO_TEST_ACCOUNT_REQUIRED',
        message:
          'This local video test doctor can only be booked by the authorized local test patient.',
      });
    }
  }

  private slotUnavailable(): ConflictException {
    return new ConflictException({
      code: 'SLOT_UNAVAILABLE',
      message: 'The selected slot is no longer available. Please choose another time.',
    });
  }

  private appointmentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'APPOINTMENT_NOT_FOUND',
      message: 'Appointment not found.',
    });
  }

  private toResponse(a: Appointment, viewerIsDoctor: boolean): AppointmentResponse {
    const date = slotDate(a.slot);
    const view = {
      status: a.status,
      type: a.type,
      date,
      startTime: a.slot.startTime,
      endTime: a.slot.endTime,
    };
    return {
      id: a.id,
      status: a.status,
      type: a.type,
      date,
      startTime: toHhMm(a.slot.startTime),
      endTime: toHhMm(a.slot.endTime),
      appointmentDate: a.appointmentDate.toISOString(),
      timeZone: CLINIC_TIME_ZONE,
      consultationFee:
        a.consultationFee === null || a.consultationFee === undefined
          ? null
          : Number(a.consultationFee),
      paymentStatus: a.paymentStatus,
      paymentReference: a.razorpayPaymentId ?? null,
      notes: a.notes ?? null,
      cancellationReason: a.cancellationReason ?? null,
      doctor: {
        id: a.doctor.id,
        name: a.doctor.user?.name ?? '',
        specialization: a.doctor.specialization,
        city: a.doctor.city ?? null,
        consultationFee: Number(a.doctor.consultationFee),
        consultationMode: a.doctor.consultationMode,
        avatarUrl: a.doctor.user?.avatarUrl ?? null,
        gender: a.doctor.user?.gender ?? null,
        isDemo: a.doctor.isDemo,
      },
      ...(viewerIsDoctor && a.patient
        ? { patient: { id: a.patient.id, name: a.patient.name } }
        : {}),
      canJoin:
        (!a.doctor.isDemo || isDemoVideoTestParticipant(a.doctor, a.patient?.id)) &&
        canJoinConsultation(view),
      canCancel: canCancelAppointment(view),
      createdAt: a.createdAt,
    };
  }
}
