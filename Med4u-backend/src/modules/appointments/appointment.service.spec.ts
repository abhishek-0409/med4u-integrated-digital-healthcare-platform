import { ForbiddenException } from '@nestjs/common';
import {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentStatus,
  AppointmentType,
} from '../../database/entities/appointment.entity';
import { ConsultationMode, Doctor } from '../../database/entities/doctor.entity';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { DEMO_DOCTOR_LICENSE } from '../auth/demo-doctor';
import { AppointmentService } from './appointment.service';
import { RazorpayService } from './razorpay.service';

describe('AppointmentService demo doctor booking', () => {
  const savedEnv = { ...process.env };
  const testPatientId = '0195bb89-2b25-7f7b-8c3d-a402c4f5e920';
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function setup(patientId = testPatientId) {
    process.env = {
      ...savedEnv,
      NODE_ENV: 'development',
      DEMO_DOCTOR_LOGIN_ENABLED: 'true',
      DEMO_DOCTOR_OTP: '246810',
      DB_HOST: 'localhost',
      DEMO_VIDEO_TEST_PATIENT_USER_ID: testPatientId,
    };
    const clinicDate = new Date(Date.now() + 330 * 60_000 + 24 * 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    const slot = {
      id: 'slot-1',
      doctorId: 'doctor-1',
      date: clinicDate,
      startTime: '09:00',
      endTime: '09:30',
      isBooked: false,
    };
    const doctor = {
      id: 'doctor-1',
      userId: 'doctor-user',
      licenseNumber: DEMO_DOCTOR_LICENSE,
      isDemo: true,
      isStagingFixture: false,
      consultationMode: ConsultationMode.BOTH,
      consultationFee: 10,
      availabilitySchedule: {
        [new Date(`${clinicDate}T00:00:00Z`)
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toLowerCase()]: { start: '09:00', end: '17:00', slotDurationMinutes: 30 },
      },
      specialization: 'General Medicine',
      user: { name: 'DEMO Doctor (Local Video Test)', avatarUrl: null, gender: null },
    };
    // The actual weekday uses UTC date arithmetic, matching the backend's clinic calendar code.
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      new Date(`${clinicDate}T00:00:00Z`).getUTCDay()
    ];
    doctor.availabilitySchedule = {
      [weekday]: { start: '09:00', end: '17:00', slotDurationMinutes: 30 },
    };
    const patient = {
      id: patientId,
      name: 'DEMO Video Test Patient',
      isActive: true,
    };
    let created: Appointment | null = null;
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn(async () => created),
    };
    const appointments = { createQueryBuilder: jest.fn(() => query) };
    const em = {
      findOne: jest.fn(async (entity: unknown) =>
        entity === TimeSlot ? slot : entity === Doctor ? doctor : patient,
      ),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (value: object) => {
        created = {
          id: 'appointment-1',
          createdAt: new Date(),
          ...value,
          doctor,
          slot,
          patient,
        } as unknown as Appointment;
        return created;
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { transaction: (fn: (manager: typeof em) => unknown) => fn(em) };
    const redis = { del: jest.fn().mockResolvedValue(1) };
    const razorpay = {
      createOrder: jest.fn(),
      verifyCheckoutSignature: jest.fn(),
    } as unknown as RazorpayService;
    const service = new AppointmentService(
      appointments as never,
      dataSource as never,
      redis as never,
      razorpay,
    );
    return { service, em, appointments, razorpay, patient, slot, doctor };
  }

  it('books through the no-charge demo path for the dedicated patient and returns a confirmed appointment', async () => {
    const { service, em, razorpay, patient, slot } = setup();
    const result = await service.createDemoBooking(patient.id, {
      doctorId: 'doctor-1',
      slotId: slot.id,
      type: AppointmentType.VIDEO,
    });
    expect(em.save).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: AppointmentPaymentStatus.NOT_REQUIRED,
      doctor: { isDemo: true },
    });
    expect(result.canJoin).toBe(false); // Join opens only inside the appointment's scheduled window.
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });

  it('refuses the demo video-test doctor for ordinary patient accounts', async () => {
    const { service, em, patient, slot } = setup('0195bb89-2b25-7f7b-8c3d-a402c4f5e921');
    await expect(
      service.createDemoBooking(patient.id, {
        doctorId: 'doctor-1',
        slotId: slot.id,
        type: AppointmentType.VIDEO,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(em.save).not.toHaveBeenCalled();
  });

  it('rejects a booking outside the published schedule', async () => {
    const { service, em, patient, slot, doctor } = setup();
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${slot.date}T00:00:00Z`).getUTCDay()];
    Object.assign(doctor, { availabilitySchedule: { [weekday]: { intervals: [{ start: '10:00', end: '12:00' }], slotDurationMinutes: 30 } } });
    await expect(service.createDemoBooking(patient.id, { doctorId: doctor.id, slotId: slot.id, type: AppointmentType.VIDEO }))
      .rejects.toMatchObject({ response: { code: 'SLOT_UNAVAILABLE' } });
    expect(em.save).not.toHaveBeenCalled();
  });

  it('rejects a slot already occupied by an existing booking', async () => {
    const { service, em, patient, slot } = setup();
    slot.isBooked = true;
    await expect(service.createDemoBooking(patient.id, { doctorId: 'doctor-1', slotId: slot.id, type: AppointmentType.VIDEO }))
      .rejects.toMatchObject({ response: { code: 'SLOT_UNAVAILABLE' } });
    expect(em.save).not.toHaveBeenCalled();
  });
});
