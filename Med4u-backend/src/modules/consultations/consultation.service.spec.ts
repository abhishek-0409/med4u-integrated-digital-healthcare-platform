import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { ConsultationService } from './consultation.service';
import { DEMO_DOCTOR_LICENSE } from '../auth/demo-doctor';

describe('ConsultationService call lifecycle', () => {
  let service: ConsultationService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    scard: jest.Mock;
    expire: jest.Mock;
  };
  let appointmentRepo: { update: jest.Mock };

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(3),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      scard: jest.fn().mockResolvedValue(2),
      expire: jest.fn().mockResolvedValue(1),
    };
    appointmentRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    service = new ConsultationService(
      appointmentRepo as unknown as Repository<Appointment>,
      {} as ConfigService,
      {} as JwtService,
      redis as never,
    );
  });

  it('does not mark an appointment completed when the room empties after a disconnect', async () => {
    await service.onRoomEmpty('appointment-id');

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });

  it('records a call start only once after a connected media peer is reported', async () => {
    await service.onCallConnected('appointment-id');

    expect(redis.set).toHaveBeenCalledWith(
      'consultation:room:appointment-id:startedAt',
      expect.any(String),
      'EX',
      4 * 3600,
      'NX',
    );
    expect(appointmentRepo.update).toHaveBeenCalledWith('appointment-id', {
      callLog: { startedAt: expect.any(String) },
    });
    expect(redis.setex).toHaveBeenCalledWith(
      'consultation:room:appointment-id:status',
      4 * 3600,
      'connected',
    );
  });

  it('keeps the room in connecting until the peer reports a media connection', async () => {
    await service.onRoomActive('appointment-id');

    expect(redis.setex).toHaveBeenCalledWith(
      'consultation:room:appointment-id:status',
      4 * 3600,
      'connecting',
    );
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('tracks only authorized participant IDs that report a connected peer', async () => {
    const count = await service.addConnectedParticipant('appointment-id', 'participant-id');

    expect(redis.sadd).toHaveBeenCalledWith(
      'consultation:room:appointment-id:connected',
      'participant-id',
    );
    expect(redis.expire).toHaveBeenCalledWith(
      'consultation:room:appointment-id:connected',
      4 * 3600,
    );
    expect(count).toBe(2);
  });

  it('clears a participant connected report when that socket leaves', async () => {
    await service.removeParticipant('appointment-id', 'participant-id');

    expect(redis.srem).toHaveBeenCalledWith(
      'consultation:room:appointment-id:connected',
      'participant-id',
    );
  });

  it('completes only on explicit end-call and only while appointment remains confirmed', async () => {
    redis.get.mockResolvedValue('2026-10-16T12:00:00.000Z');

    await service.onCallEnded('appointment-id');

    expect(appointmentRepo.update).toHaveBeenCalledWith(
      { id: 'appointment-id', status: AppointmentStatus.CONFIRMED },
      {
        callLog: {
          startedAt: '2026-10-16T12:00:00.000Z',
          endedAt: expect.any(String),
          durationSeconds: expect.any(Number),
        },
        status: AppointmentStatus.COMPLETED,
      },
    );
  });

  it('does not complete or invent a duration for a call that never connected', async () => {
    redis.get.mockResolvedValue(null);

    await service.onCallEnded('appointment-id');

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(redis.setex).toHaveBeenCalledWith(
      'consultation:room:appointment-id:status',
      4 * 3600,
      'ended',
    );
  });

  it('issues short-lived coturn REST credentials when a shared secret is configured', () => {
    const sharedSecret = 'a-configured-test-secret-that-is-long-enough';
    const values: Record<string, unknown> = {
      TURN_SERVER_URL: 'turn:turn.example.test:3478',
      TURN_SHARED_SECRET: sharedSecret,
      TURN_CREDENTIAL_TTL_SECONDS: 3600,
    };
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as ConfigService;
    const configuredService = new ConsultationService(
      appointmentRepo as unknown as Repository<Appointment>,
      config,
      {} as JwtService,
      redis as never,
    );
    const turnServers = (
      configuredService as unknown as {
        buildTurnServers: () => Array<{ urls: string; username: string; credential: string }>;
      }
    ).buildTurnServers();
    const turn = turnServers[0];

    expect(turn.urls).toBe('turn:turn.example.test:3478');
    expect(turn.username).toMatch(/^\d+:[0-9a-f-]+$/i);
    expect(turn.credential).toBe(
      createHmac('sha1', sharedSecret).update(turn.username).digest('base64'),
    );
  });
});

describe('ConsultationService appointment authorization', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const start = new Date(Date.now() + 5 * 60_000 + 330 * 60_000);
  const date = start.toISOString().slice(0, 10);
  const startTime = start.toISOString().slice(11, 16);
  const endTime = new Date(start.getTime() + 30 * 60_000).toISOString().slice(11, 16);
  const videoTestPatientId = '0195bb89-2b25-7f7b-8c3d-a402c4f5e920';
  const appointment = (overrides: Record<string, unknown> = {}) => ({
    id: 'appointment-id',
    patientId: videoTestPatientId,
    status: AppointmentStatus.CONFIRMED,
    type: 'video',
    doctor: { userId: 'doctor-1', isDemo: true, licenseNumber: DEMO_DOCTOR_LICENSE },
    patient: { id: videoTestPatientId },
    slot: { date, startTime, endTime },
    ...overrides,
  });

  it('authorizes both appointment participants but refuses unrelated accounts', async () => {
    const row = appointment();
    const repo = { findOne: jest.fn().mockResolvedValue(row) };
    const service = new ConsultationService(repo as never, {} as never, {} as never, {} as never);
    await expect(service.requireParticipant(videoTestPatientId, row.id)).resolves.toBe(row);
    await expect(service.requireParticipant('doctor-1', row.id)).resolves.toBe(row);
    await expect(service.requireParticipant('other-user', row.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }),
    });
  });

  it('lets only the opted-in video test patient join the target demo doctor appointment', async () => {
    process.env = {
      ...saved,
      NODE_ENV: 'development',
      DEMO_DOCTOR_LOGIN_ENABLED: 'true',
      DEMO_DOCTOR_OTP: '246810',
      DB_HOST: 'localhost',
      DEMO_VIDEO_TEST_PATIENT_USER_ID: videoTestPatientId,
    };
    const row = appointment();
    const repo = { findOne: jest.fn().mockResolvedValue(row) };
    const service = new ConsultationService(repo as never, {} as never, {} as never, {} as never);
    await expect(service.requireJoinable(videoTestPatientId, row.id)).resolves.toBe(row);
    row.patient.id = '0195bb89-2b25-7f7b-8c3d-a402c4f5e921';
    await expect(service.requireJoinable(videoTestPatientId, row.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONSULTATION_NOT_AVAILABLE' }),
    });
  });
});
