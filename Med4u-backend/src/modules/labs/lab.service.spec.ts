import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LabBooking } from '../../database/entities/lab-booking.entity';
import { LabTest } from '../../database/entities/lab-test.entity';
import { CreateLabBookingSchema } from './lab.dto';
import { LabService } from './lab.service';

describe('LabService', () => {
  const test: LabTest = {
    id: 'test-id',
    name: 'Demo CBC',
    category: 'Demo',
    description: 'Demo only',
    price: 123.45,
    turnaroundDays: 1,
    sampleType: 'Demo only',
    preparationInstructions: 'Demo only',
    homeCollectionAvailable: false,
    labLocation: 'Demo only',
    isDemo: true,
    isActive: true,
  } as LabTest;

  const setup = () => {
    const tests = {
      find: jest.fn().mockResolvedValue([test]),
      findOne: jest.fn().mockResolvedValue(test),
    };
    let saved: Partial<LabBooking> = {};
    const bookings = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        saved = { ...value, id: 'booking-id', createdAt: new Date() };
        return saved;
      }),
      findOneOrFail: jest.fn(async () => ({ ...saved, test })),
    };
    return {
      service: new LabService(
        tests as unknown as Repository<LabTest>,
        bookings as unknown as Repository<LabBooking>,
      ),
      tests,
      bookings,
    };
  };

  it('only lists explicitly marked active demo services and normalizes INR prices', async () => {
    const { service, tests } = setup();
    const items = await service.catalog();
    expect(tests.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, isDemo: true } }),
    );
    expect(items[0].price).toBe(123.45);
    expect(items[0].isDemo).toBe(true);
  });

  it('takes the server catalog price and creates a pending demo request', async () => {
    const { service, bookings } = setup();
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await service.create('patient-id', {
      testId: test.id,
      preferredDate: date,
      preferredTime: '09:00',
      homeCollection: false,
      contactName: 'Demo Patient',
      contactPhone: '+919876543210',
    });
    expect(bookings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priceSnapshot: test.price,
        status: 'pending',
        bookingSource: 'app',
        userId: 'patient-id',
      }),
    );
    expect(result.priceSnapshot).toBe(123.45);
    expect(result.test.isDemo).toBe(true);
  });

  it('rejects another booking at the same patient time', async () => {
    const { service, bookings } = setup();
    bookings.findOne.mockResolvedValueOnce({ id: 'existing' });
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(
      service.create('patient-id', {
        testId: test.id,
        preferredDate: date,
        preferredTime: '09:00',
        homeCollection: false,
        contactName: 'Demo Patient',
        contactPhone: '+919876543210',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(bookings.save).not.toHaveBeenCalled();
  });

  const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const base = () => ({
    testId: test.id,
    preferredDate: tomorrow(),
    preferredTime: '09:00',
    homeCollection: false,
    contactName: 'Demo Patient',
    contactPhone: '+919876543210',
  });

  it('exposes a booking reference derived from the id', async () => {
    const { service } = setup();
    const result = await service.create('patient-id', base());
    expect(result.reference).toBe('LAB-BOOKING-');
  });

  it('rejects unknown or inactive tests', async () => {
    const { service, tests, bookings } = setup();
    tests.findOne.mockResolvedValueOnce(null);
    await expect(service.create('patient-id', base())).rejects.toBeInstanceOf(NotFoundException);
    expect(bookings.save).not.toHaveBeenCalled();
  });

  it('rejects home collection for tests that do not offer it', async () => {
    const { service } = setup();
    await expect(
      service.create('patient-id', {
        ...base(),
        homeCollection: true,
        address: { line1: '1 Street', city: 'Pune', state: 'MH', pincode: '411001' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects past dates, dates beyond 60 days and slots already passed today', async () => {
    const { service } = setup();
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const far = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(service.create('p', { ...base(), preferredDate: past })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('p', { ...base(), preferredDate: far })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // 21:32 IST on 1 Jan is 16:02 UTC: an 8 PM IST slot has passed even though 20:00 UTC has not.
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T16:02:00Z'));
    try {
      await expect(
        service.create('p', { ...base(), preferredDate: '2030-01-01', preferredTime: '18:00' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create('p', { ...base(), preferredDate: '2030-01-01', preferredTime: '08:00' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      jest.useRealTimers();
    }
  });

  it('maps a database unique violation to a slot conflict', async () => {
    const { service, bookings } = setup();
    bookings.save.mockRejectedValueOnce({ code: '23505' });
    await expect(service.create('patient-id', base())).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not accept client-supplied price, status or owner', () => {
    for (const extra of [{ price: 1 }, { status: 'confirmed' }, { userId: 'someone-else' }]) {
      const parsed = CreateLabBookingSchema.safeParse({
        ...base(),
        testId: '8f3c1f0e-7d0b-4a76-9d3e-6a1f2b0c9d11',
        ...extra,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('scopes list, get and cancel to the signed-in patient', async () => {
    const { service, bookings } = setup();
    await service.list('patient-a');
    expect(bookings.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'patient-a' } }),
    );
    await expect(service.get('patient-a', 'booking-x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel('patient-a', 'booking-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(bookings.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'booking-x', userId: 'patient-a' } }),
    );
  });

  it('cancels a future pending booking but refuses completed ones', async () => {
    const { service, bookings } = setup();
    const row = {
      id: 'b1',
      testId: test.id,
      status: 'pending',
      preferredDate: new Date(`${tomorrow()}T00:00:00.000Z`),
      preferredTime: '09:00',
      priceSnapshot: 100,
      test,
    };
    bookings.findOne.mockResolvedValueOnce({ ...row });
    bookings.save.mockImplementation(async (v: Partial<LabBooking>) => v);
    expect((await service.cancel('p', 'b1')).status).toBe('cancelled');
    bookings.findOne.mockResolvedValueOnce({ ...row, status: 'completed' });
    await expect(service.cancel('p', 'b1')).rejects.toBeInstanceOf(ConflictException);
  });
});
