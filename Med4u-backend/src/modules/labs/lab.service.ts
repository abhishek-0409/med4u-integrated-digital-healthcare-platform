import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LabBooking, LabBookingStatus } from '../../database/entities/lab-booking.entity';
import { LabTest } from '../../database/entities/lab-test.entity';
import { isWithinBookingWindow, toInstant } from '../appointments/appointment-time.util';
import { CreateLabBookingDto } from './lab.dto';
import { labBookingDto, labTestDto } from './lab.types';

@Injectable()
export class LabService {
  constructor(
    @InjectRepository(LabTest) private readonly tests: Repository<LabTest>,
    @InjectRepository(LabBooking) private readonly bookings: Repository<LabBooking>,
  ) {}

  async catalog() {
    return (
      await this.tests.find({
        where: { isActive: true, isDemo: true },
        order: { category: 'ASC', name: 'ASC' },
      })
    ).map(labTestDto);
  }

  async create(patientId: string, dto: CreateLabBookingDto) {
    // No verified provider is integrated; only explicit demo catalog rows accept demo requests.
    const test = await this.tests.findOne({
      where: { id: dto.testId, isActive: true, isDemo: true },
    });
    if (!test)
      throw new NotFoundException({
        code: 'LAB_TEST_NOT_FOUND',
        message: 'Lab test is unavailable.',
      });
    if (dto.homeCollection && !test.homeCollectionAvailable)
      throw new BadRequestException({
        code: 'HOME_COLLECTION_UNAVAILABLE',
        message: 'Home collection is not offered for this demo test.',
      });
    const date = new Date(`${dto.preferredDate}T00:00:00.000Z`);
    // Slot dates and times are wall-clock IST, the same convention as appointments.
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.preferredDate ||
      !isWithinBookingWindow(dto.preferredDate)
    )
      throw new BadRequestException({
        code: 'INVALID_LAB_DATE',
        message: 'Choose a valid date within the next 60 days.',
      });
    if (toInstant(dto.preferredDate, dto.preferredTime) <= new Date())
      throw new BadRequestException({
        code: 'INVALID_LAB_DATE',
        message: 'Choose a time slot that has not already passed.',
      });
    try {
      const existing = await this.bookings.findOne({
        where: {
          userId: patientId,
          preferredDate: date,
          preferredTime: dto.preferredTime,
          bookingSource: 'app',
        },
      });
      if (existing)
        throw new ConflictException({
          code: 'LAB_SLOT_TAKEN',
          message: 'You already have a lab booking at that time.',
        });
      const booking = this.bookings.create({
        userId: patientId,
        testId: test.id,
        preferredDate: date,
        preferredTime: dto.preferredTime,
        homeCollection: dto.homeCollection,
        address: dto.address,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        priceSnapshot: test.price,
        bookingSource: 'app',
        status: LabBookingStatus.PENDING,
      });
      const saved = await this.bookings.save(booking);
      const withTest = await this.bookings.findOneOrFail({
        where: { id: saved.id },
        relations: { test: true },
      });
      return labBookingDto(withTest);
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw new ConflictException({
          code: 'LAB_SLOT_TAKEN',
          message: 'You already have a lab booking at that time.',
        });
      throw err;
    }
  }

  async list(patientId: string) {
    return (
      await this.bookings.find({
        where: { userId: patientId },
        relations: { test: true },
        order: { preferredDate: 'DESC', preferredTime: 'DESC' },
      })
    ).map(labBookingDto);
  }

  async get(patientId: string, id: string) {
    const row = await this.bookings.findOne({
      where: { id, userId: patientId },
      relations: { test: true },
    });
    if (!row)
      throw new NotFoundException({ code: 'LAB_BOOKING_NOT_FOUND', message: 'Booking not found.' });
    return labBookingDto(row);
  }

  async cancel(patientId: string, id: string) {
    const row = await this.bookings.findOne({
      where: { id, userId: patientId },
      relations: { test: true },
    });
    if (!row)
      throw new NotFoundException({ code: 'LAB_BOOKING_NOT_FOUND', message: 'Booking not found.' });
    if (row.status === LabBookingStatus.CANCELLED) return labBookingDto(row);
    if (row.status !== LabBookingStatus.PENDING && row.status !== LabBookingStatus.CONFIRMED)
      throw new ConflictException({
        code: 'LAB_BOOKING_NOT_CANCELLABLE',
        message: 'This booking can no longer be cancelled.',
      });
    const slot = toInstant(String(row.preferredDate).slice(0, 10), row.preferredTime);
    if (slot <= new Date())
      throw new ConflictException({
        code: 'LAB_BOOKING_NOT_CANCELLABLE',
        message: 'Bookings cannot be cancelled after their scheduled time.',
      });
    row.status = LabBookingStatus.CANCELLED;
    return labBookingDto(await this.bookings.save(row));
  }
}
