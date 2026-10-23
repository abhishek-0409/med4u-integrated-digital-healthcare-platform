import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import request = require('supertest');
import { GlobalHttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../../database/entities/user.entity';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { DoctorSelfProfileResponse } from './doctor.types';

@Injectable()
class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const [, sub, role] = /^Bearer test:([^:]+):(\w+)$/.exec(req.headers.authorization ?? '') ?? [];
    if (!sub)
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    req.user = { sub, role, phone: '' };
    return true;
  }
}

const profile = (
  overrides: Partial<DoctorSelfProfileResponse> = {},
): DoctorSelfProfileResponse => ({
  id: 'doctor-a',
  userId: 'user-a',
  name: 'Dr A',
  specialization: 'Cardiology',
  isVerified: true,
  isDemo: false,
  isStagingFixture: false,
  isDemoAccount: false,
  verification: { status: 'verified' },
  availabilitySchedule: {},
  licenseStatus: 'provided',
  registrationStatus: 'provided',
  ...overrides,
});

describe('GET /api/v1/doctors/me', () => {
  let app: INestApplication;
  const profiles = new Map<string, DoctorSelfProfileResponse>([
    ['user-a', profile()],
    ['user-b', profile({ id: 'doctor-b', userId: 'user-b', name: 'Dr B' })],
    [
      'demo-user',
      profile({
        id: 'demo-doctor',
        userId: 'demo-user',
        isDemo: true,
        isVerified: false,
        verification: { status: 'unverified' },
        registrationStatus: 'not_provided',
      }),
    ],
    [
      'incomplete-user',
      profile({
        id: 'incomplete-doctor',
        userId: 'incomplete-user',
        isVerified: false,
        verification: { status: 'unverified' },
        licenseStatus: 'missing',
        registrationStatus: 'not_provided',
      }),
    ],
  ]);
  const getSelfProfile = jest.fn(async (userId: string) => {
    const found = profiles.get(userId);
    if (!found)
      throw new NotFoundException({
        code: 'DOCTOR_PROFILE_NOT_FOUND',
        message: 'Doctor profile not found.',
      });
    return found;
  });

  const http = () => request(app.getHttpServer());
  const as = (userId: string, role = 'doctor') => `Bearer test:${userId}:${role}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [
        { provide: DoctorService, useValue: { getSelfProfile } },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log() {}, error() {}, warn() {} } },
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => getSelfProfile.mockClear());

  it('rejects requests without authentication', async () => {
    const res = await http().get('/api/v1/doctors/me');
    expect(res.status).toBe(401);
    expect(getSelfProfile).not.toHaveBeenCalled();
  });

  it('rejects patient accounts with the existing role guard', async () => {
    const res = await http()
      .get('/api/v1/doctors/me')
      .set('Authorization', as('user-a', 'patient'));
    expect(res.status).toBe(403);
    expect(getSelfProfile).not.toHaveBeenCalled();
  });

  it('resolves only the authenticated user’s linked profile and ignores supplied user IDs', async () => {
    const res = await http()
      .get('/api/v1/doctors/me?userId=user-b')
      .set('Authorization', as('user-a'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: profile(), error: null });
    expect(getSelfProfile).toHaveBeenCalledWith('user-a');
    expect(res.body.data.id).not.toBe('doctor-b');
  });

  it('returns not found for an unlinked doctor account', async () => {
    const res = await http().get('/api/v1/doctors/me').set('Authorization', as('unlinked-user'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DOCTOR_PROFILE_NOT_FOUND');
  });

  it('returns demo and unverified eligibility flags without granting real-doctor eligibility', async () => {
    const res = await http().get('/api/v1/doctors/me').set('Authorization', as('demo-user'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isDemo: true,
      isVerified: false,
      verification: { status: 'unverified' },
      registrationStatus: 'not_provided',
    });
  });

  it('returns incomplete profile indicators without inventing a completion field', async () => {
    const res = await http().get('/api/v1/doctors/me').set('Authorization', as('incomplete-user'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isVerified: false,
      licenseStatus: 'missing',
      registrationStatus: 'not_provided',
    });
    expect(res.body.data).not.toHaveProperty('profileComplete');
    expect(res.body.data).not.toHaveProperty('licenseNumber');
  });

  it('never returns another profile even when another doctor profile is present', async () => {
    const res = await http().get('/api/v1/doctors/me').set('Authorization', as('user-a'));
    expect(res.body.data).toMatchObject({ id: 'doctor-a', userId: 'user-a' });
    expect(res.body.data).not.toMatchObject({ id: 'doctor-b', userId: 'user-b' });
  });
});

describe('inactive user authorization', () => {
  it('continues to reject inactive accounts in the JWT strategy', async () => {
    const userRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const config = { getOrThrow: jest.fn().mockReturnValue('test-secret') };
    const strategy = new JwtStrategy(config as never, userRepo as never);
    await expect(
      strategy.validate({ sub: 'inactive-user', role: UserRole.DOCTOR, phone: '+10000000000' }),
    ).rejects.toThrow('deactivated');
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'inactive-user', isActive: true },
      select: { id: true, phone: true, role: true, isActive: true, email: true },
    });
  });
});

describe('DoctorService.getSelfProfile', () => {
  const baseDoctor = {
    id: 'doctor-self',
    userId: 'jwt-subject',
    user: { name: 'Dr Linked' },
    specialization: 'Neurology',
    isVerified: true,
    isDemo: false,
    isStagingFixture: false,
  isDemoAccount: false,
    verificationStatus: 'verified' as 'verified' | 'unverified' | 'rejected',
    licenseNumber: 'SECRET-LICENSE-123',
    registrationCouncil: 'Example Council',
    registrationNumber: 'SECRET-REG-456',
    availabilitySchedule: { monday: { start: '09:00', end: '17:00', slotDurationMinutes: 30 } },
  };

  function serviceFor(doctor: typeof baseDoctor) {
    const doctorRepo = { requireByUserId: jest.fn().mockResolvedValue(doctor) };
    const service = new DoctorService(doctorRepo as never, {} as never, {} as never, {} as never);
    return { service, doctorRepo };
  }

  it('uses the JWT subject lookup and returns only minimal non-secret identity fields', async () => {
    const { service, doctorRepo } = serviceFor(baseDoctor);
    const result = await service.getSelfProfile('jwt-subject');
    expect(doctorRepo.requireByUserId).toHaveBeenCalledWith('jwt-subject');
    expect(result).toEqual({
      id: 'doctor-self',
      userId: 'jwt-subject',
      name: 'Dr Linked',
      specialization: 'Neurology',
      isVerified: true,
      isDemo: false,
      isStagingFixture: false,
  isDemoAccount: false,
      verification: { status: 'verified' },
      availabilitySchedule: baseDoctor.availabilitySchedule,
      licenseStatus: 'provided',
      registrationStatus: 'provided',
    });
    expect(result).not.toHaveProperty('licenseNumber');
    expect(result).not.toHaveProperty('registration.number');
  });

  it('updates availability only through the doctor linked to the authenticated user', async () => {
    const doctorRepo = {
      requireByUserId: jest.fn().mockResolvedValue(baseDoctor),
      update: jest.fn().mockResolvedValue({ ...baseDoctor, availabilitySchedule: { sunday: { intervals: [{ start: '00:00', end: '08:00' }] } } }),
      toDetailResponse: jest.fn().mockReturnValue({}),
    };
    const redis = { del: jest.fn().mockResolvedValue(1), scan: jest.fn().mockResolvedValue(['0', []]) };
    const service = new DoctorService(doctorRepo as never, {} as never, redis as never, {} as never);
    const availabilitySchedule = { sunday: { intervals: [{ start: '00:00', end: '08:00' }] } };
    await service.updateMe('jwt-subject', { availabilitySchedule } as never);
    expect(doctorRepo.requireByUserId).toHaveBeenCalledWith('jwt-subject');
    expect(doctorRepo.update).toHaveBeenCalledWith('doctor-self', { availabilitySchedule });
  });

  it('reports demo and incomplete/unverified profile state without changing eligibility', async () => {
    const { service } = serviceFor({
      ...baseDoctor,
      isVerified: false,
      isDemo: true,
      isStagingFixture: false,
  isDemoAccount: false,
      verificationStatus: 'unverified',
      licenseNumber: '',
      registrationCouncil: null as never,
      registrationNumber: null as never,
    });
    await expect(service.getSelfProfile('jwt-subject')).resolves.toMatchObject({
      isDemo: true,
      isVerified: false,
      verification: { status: 'unverified' },
      licenseStatus: 'missing',
      registrationStatus: 'not_provided',
    });
  });
});
