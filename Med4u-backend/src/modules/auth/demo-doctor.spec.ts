import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { validateEnv } from '../../config/env.validation';
import { UserRole } from '../../database/entities/user.entity';
import {
  DEMO_DOCTOR_EMAIL,
  DEMO_DOCTOR_LICENSE,
  DEMO_DOCTOR_PHONE,
  demoDoctorConfigProblem,
  demoDoctorLoginEnabled,
  demoVideoTestPatientConfigProblem,
  isDemoAccountEmail,
  isDemoVideoTestParticipant,
} from './demo-doctor';
import { AuthService } from './auth.service';
import { DemoAccountGuard } from './demo-account.guard';
import { OtpService } from './otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { assertDemoSeedEnvironment, DemoSeedError } from './demo-seed';
import { SendOtpSchema } from './dto/send-otp.dto';

const DEV = {
  NODE_ENV: 'development',
  DEMO_DOCTOR_LOGIN_ENABLED: 'true',
  DEMO_DOCTOR_OTP: '246810',
  DB_HOST: 'localhost',
  DEMO_VIDEO_TEST_PATIENT_USER_ID: '0195bb89-2b25-7f7b-8c3d-a402c4f5e920',
};

describe('demo doctor login gating', () => {
  it('is enabled only for development with the explicit flag and a 6-digit code', () => {
    expect(demoDoctorLoginEnabled(DEV)).toBe(true);
  });

  it.each([
    ['production', { ...DEV, NODE_ENV: 'production' }],
    ['staging-style NODE_ENV', { ...DEV, NODE_ENV: 'staging' }],
    ['test', { ...DEV, NODE_ENV: 'test' }],
    ['flag off', { ...DEV, DEMO_DOCTOR_LOGIN_ENABLED: 'false' }],
    ['flag missing', { NODE_ENV: 'development', DEMO_DOCTOR_OTP: '246810' }],
    ['no OTP configured', { ...DEV, DEMO_DOCTOR_OTP: undefined }],
    ['malformed OTP', { ...DEV, DEMO_DOCTOR_OTP: '12' }],
    ['hosted platform', { ...DEV, RENDER: 'true' }],
    ['hosted platform (k8s)', { ...DEV, KUBERNETES_SERVICE_HOST: '10.0.0.1' }],
  ])('is disabled: %s', (_name, env) => {
    expect(demoDoctorLoginEnabled(env as NodeJS.ProcessEnv)).toBe(false);
  });

  it('reports a config problem for the flag anywhere but development', () => {
    expect(demoDoctorConfigProblem({ ...DEV, NODE_ENV: 'production' })).toMatch(
      /NODE_ENV=development/,
    );
    expect(demoDoctorConfigProblem({ ...DEV, NODE_ENV: 'staging' })).toMatch(
      /NODE_ENV=development/,
    );
    expect(demoDoctorConfigProblem({ ...DEV, RAILWAY_ENVIRONMENT: 'x' })).toMatch(/hosted/);
    expect(demoDoctorConfigProblem({ ...DEV, DB_SSL: 'true' })).toMatch(/SSL/);
    expect(demoDoctorConfigProblem({ ...DEV, DEMO_DOCTOR_OTP: undefined })).toMatch(
      /DEMO_DOCTOR_OTP/,
    );
    expect(demoDoctorConfigProblem(DEV)).toBeNull();
    expect(demoDoctorConfigProblem({ NODE_ENV: 'production' })).toBeNull();
  });

  it('allows video test access only to the backend-configured patient id and special demo profile', () => {
    const target = { isDemo: true, licenseNumber: DEMO_DOCTOR_LICENSE };
    expect(isDemoVideoTestParticipant(target, DEV.DEMO_VIDEO_TEST_PATIENT_USER_ID, DEV)).toBe(true);
    expect(isDemoVideoTestParticipant(target, 'patient@example.com', DEV)).toBe(false);
    expect(
      isDemoVideoTestParticipant(
        { ...target, licenseNumber: 'DEMO-DOC-001' },
        DEV.DEMO_VIDEO_TEST_PATIENT_USER_ID,
        DEV,
      ),
    ).toBe(false);
    expect(
      isDemoVideoTestParticipant(target, DEV.DEMO_VIDEO_TEST_PATIENT_USER_ID, {
        ...DEV,
        DEMO_DOCTOR_LOGIN_ENABLED: 'false',
      }),
    ).toBe(false);
    expect(
      isDemoVideoTestParticipant(target, DEV.DEMO_VIDEO_TEST_PATIENT_USER_ID, {
        ...DEV,
        NODE_ENV: 'production',
      }),
    ).toBe(false);
    expect(isDemoVideoTestParticipant(target, DEV.DEMO_VIDEO_TEST_PATIENT_USER_ID, {
      ...DEV,
      DB_HOST: 'remote-db.example',
    })).toBe(false);
  });

  it('rejects a configured video test patient outside local development', () => {
    expect(demoVideoTestPatientConfigProblem(DEV)).toBeNull();
    expect(demoVideoTestPatientConfigProblem({ ...DEV, NODE_ENV: 'production' })).toMatch(
      /local demo doctor feature/,
    );
    expect(demoVideoTestPatientConfigProblem({ ...DEV, DB_HOST: 'remote-db.example' })).toMatch(
      /local database/,
    );
    expect(demoVideoTestPatientConfigProblem({ ...DEV, DB_SSL: 'true' })).toMatch(/DB_SSL/);
    expect(demoVideoTestPatientConfigProblem({ ...DEV, DEMO_VIDEO_TEST_PATIENT_USER_ID: 'not-a-uuid' })).toMatch(/UUID/);
  });
});

describe('startup validation refuses the demo flag outside development', () => {
  const base = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'u',
    DB_PASSWORD: 'a-real-looking-password-value',
    DB_NAME: 'med4u_db',
    JWT_SECRET: 'x'.repeat(40),
    JWT_REFRESH_SECRET: 'y'.repeat(40),
  };
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('accepts a development config with the flag and a code', () => {
    process.env = { ...saved, NODE_ENV: 'development' };
    delete process.env.RENDER;
    expect(() => validateEnv({ ...base, ...DEV })).not.toThrow();
  });

  it.each(['production', 'test'])('rejects the flag when NODE_ENV=%s', (nodeEnv) => {
    process.env = { ...saved, NODE_ENV: nodeEnv };
    expect(() => validateEnv({ ...base, ...DEV, NODE_ENV: nodeEnv })).toThrow(
      /DEMO_DOCTOR_LOGIN_ENABLED/,
    );
  });

  it('rejects the flag without a configured code', () => {
    process.env = { ...saved, NODE_ENV: 'development' };
    expect(() => validateEnv({ ...base, ...DEV, DEMO_DOCTOR_OTP: undefined })).toThrow(
      /DEMO_DOCTOR_OTP/,
    );
  });

  it('requires DOCUMENT_ENCRYPTION_KEY to differ from ENCRYPTION_KEY', () => {
    process.env = { ...saved, NODE_ENV: 'development' };
    const k = 'k'.repeat(40);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'development',
        ENCRYPTION_KEY: k,
        DOCUMENT_ENCRYPTION_KEY: k,
      }),
    ).toThrow(/must differ/);
  });

  it('treats a placeholder DOCUMENT_ENCRYPTION_KEY like any other placeholder secret', () => {
    process.env = { ...saved, NODE_ENV: 'development' };
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'development',
        DOCUMENT_ENCRYPTION_KEY: 'CHANGE_ME_' + 'x'.repeat(30),
      }),
    ).toThrow(/DOCUMENT_ENCRYPTION_KEY/);
  });
});

describe('OtpService and the reserved demo number', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  function build() {
    const store = new Map<string, string>();
    const pipeline = {
      setex: (k: string, _ttl: number, v: string) => (store.set(k, v), pipeline),
      del: (k: string) => (store.delete(k), pipeline),
      exec: async () => [],
    };
    const redis = {
      get: async (k: string) => store.get(k) ?? null,
      ttl: async () => -2,
      incr: async () => 1,
      expire: async () => 1,
      del: async (k: string) => (store.delete(k), 1),
      pipeline: () => pipeline,
    };
    const config = { get: (k: string) => (k === 'NODE_ENV' ? process.env.NODE_ENV : undefined) };
    const service = new OtpService(redis as never, config as never);
    service.onModuleInit();
    return service;
  }

  it('lets the demo number verify with the configured code in an enabled development run', async () => {
    process.env = { ...saved, ...DEV };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const otp = build();
    await otp.sendOtp(DEMO_DOCTOR_PHONE);
    await expect(otp.verifyOtp(DEMO_DOCTOR_PHONE, '246810')).resolves.toBeUndefined();
  });

  it('never prints the demo code', async () => {
    process.env = { ...saved, ...DEV };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await build().sendOtp(DEMO_DOCTOR_PHONE);
    expect(log.mock.calls.flat().join(' ')).not.toContain('246810');
  });

  it('does not log a patient phone or OTP when SMS delivery is unavailable', async () => {
    process.env = { ...saved, ...DEV };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const otp = build();
    await expect(otp.sendOtp('+919876543210')).rejects.toMatchObject({
      response: { code: 'SMS_UNAVAILABLE' },
    });
    expect(log).not.toHaveBeenCalled();
    await expect(otp.verifyOtp('+919876543210', '246810')).rejects.toMatchObject({
      response: { code: 'OTP_EXPIRED' },
    });
  });

  it('with the flag off, the demo number cannot use the local fixed code or leak a fallback OTP', async () => {
    process.env = {
      ...saved,
      NODE_ENV: 'development',
      DEMO_DOCTOR_LOGIN_ENABLED: 'false',
      DEMO_DOCTOR_OTP: '246810',
    };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const otp = build();
    await expect(otp.sendOtp(DEMO_DOCTOR_PHONE)).rejects.toMatchObject({
      response: { code: 'SMS_UNAVAILABLE' },
    });
    expect(log).not.toHaveBeenCalled();
    await expect(otp.verifyOtp(DEMO_DOCTOR_PHONE, '246810')).rejects.toMatchObject({
      response: { code: 'OTP_EXPIRED' },
    });
  });

  it('refuses to send to the reserved number in production, even with the flag set', async () => {
    process.env = { ...saved, ...DEV, NODE_ENV: 'production' };
    await expect(build().sendOtp(DEMO_DOCTOR_PHONE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses the reserved number in production when the flag is simply absent', async () => {
    process.env = { ...saved, NODE_ENV: 'production' };
    delete process.env.DEMO_DOCTOR_LOGIN_ENABLED;
    await expect(build().sendOtp(DEMO_DOCTOR_PHONE)).rejects.toMatchObject({
      response: { code: 'RESERVED_PHONE_NUMBER' },
    });
  });
});

describe('demo accounts are unusable outside an enabled development run', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const demoUser = {
    id: 'u1',
    phone: DEMO_DOCTOR_PHONE,
    email: DEMO_DOCTOR_EMAIL,
    role: UserRole.DOCTOR,
    isActive: true,
    isVerified: true,
  };

  it('AuthService.verifyOtp rejects a demo account when the demo login is disabled', async () => {
    process.env = { ...saved, NODE_ENV: 'production' };
    const users = { findOne: jest.fn().mockResolvedValue(demoUser) };
    const service = new AuthService(
      { verifyOtp: jest.fn().mockResolvedValue(undefined) } as never,
      { generateTokenPair: jest.fn() } as never,
      users as never,
    );
    await expect(
      service.verifyOtp({ phone: DEMO_DOCTOR_PHONE, otp: '246810' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('JwtStrategy rejects a token for a demo account when disabled, and accepts it when enabled', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(demoUser) };
    const strategy = new JwtStrategy({ getOrThrow: () => 's' } as never, users as never);
    process.env = { ...saved, NODE_ENV: 'production' };
    await expect(
      strategy.validate({ sub: 'u1', phone: demoUser.phone, role: UserRole.DOCTOR }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    process.env = { ...saved, ...DEV };
    await expect(
      strategy.validate({ sub: 'u1', phone: demoUser.phone, role: UserRole.DOCTOR }),
    ).resolves.toMatchObject({
      sub: 'u1',
    });
  });

  it('a production boot with any demo account present is refused', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const guard = new DemoAccountGuard({ count } as never);
    await expect(guard.assertNoDemoAccountsInProduction('production')).rejects.toThrow(
      /Demo accounts must never/,
    );
    await expect(guard.assertNoDemoAccountsInProduction('development')).resolves.toBeUndefined();
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('identifies demo accounts only by the reserved .invalid domain', () => {
    expect(isDemoAccountEmail(DEMO_DOCTOR_EMAIL)).toBe(true);
    expect(isDemoAccountEmail('doctor@example.com')).toBe(false);
    expect(isDemoAccountEmail(null)).toBe(false);
  });
});

describe('demo seeding script guard', () => {
  const ok = { ...DEV };
  it('accepts a confirmed local development database', () => {
    expect(() =>
      assertDemoSeedEnvironment(ok, { host: 'localhost', name: 'med4u_db' }, 'med4u_db'),
    ).not.toThrow();
  });
  it.each([
    [
      'production env',
      { ...ok, NODE_ENV: 'production' },
      { host: 'localhost', name: 'med4u_db' },
      'med4u_db',
    ],
    ['no opt-in', { NODE_ENV: 'development' }, { host: 'localhost', name: 'med4u_db' }, 'med4u_db'],
    ['remote database', ok, { host: 'db.example.com', name: 'med4u_db' }, 'med4u_db'],
    ['production-looking name', ok, { host: 'localhost', name: 'med4u_prod' }, 'med4u_prod'],
    ['unconfirmed name', ok, { host: 'localhost', name: 'med4u_db' }, undefined],
  ])('refuses: %s', (_n, env, db, confirm) => {
    expect(() => assertDemoSeedEnvironment(env as NodeJS.ProcessEnv, db, confirm)).toThrow(
      DemoSeedError,
    );
  });
});

describe('phone normalization at the API boundary', () => {
  it('turns 1111111112 into the reserved E.164 number', () => {
    expect(SendOtpSchema.parse({ phone: '1111111112' }).phone).toBe(DEMO_DOCTOR_PHONE);
    expect(SendOtpSchema.parse({ phone: '+91 1111 111112' }).phone).toBe(DEMO_DOCTOR_PHONE);
  });
  it('still accepts canonical numbers unchanged and rejects garbage', () => {
    expect(SendOtpSchema.parse({ phone: '+919876543210' }).phone).toBe('+919876543210');
    expect(SendOtpSchema.safeParse({ phone: 'hello' }).success).toBe(false);
    expect(SendOtpSchema.safeParse({ phone: '123' }).success).toBe(false);
  });
});

describe('AuthService.verifyOtp for the reserved demo number never creates an ordinary account', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const demoDoctor = {
    id: 'u1',
    phone: DEMO_DOCTOR_PHONE,
    email: DEMO_DOCTOR_EMAIL,
    role: UserRole.DOCTOR,
    isActive: true,
    isVerified: true,
    name: 'DEMO',
  };

  function build(found: unknown, doctorRows = 1) {
    const users = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      manager: { count: jest.fn().mockResolvedValue(doctorRows) },
    };
    const tokens = {
      generateTokenPair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };
    const service = new AuthService(
      { verifyOtp: jest.fn().mockResolvedValue(undefined) } as never,
      tokens as never,
      users as never,
    );
    return { service, users, tokens };
  }
  const dto = { phone: DEMO_DOCTOR_PHONE, otp: '246810' };

  it('signs the seeded demo doctor in as a doctor, without creating anything', async () => {
    process.env = { ...saved, ...DEV };
    const { service, users } = build(demoDoctor);
    const result = await service.verifyOtp(dto);
    expect(result.user.role).toBe(UserRole.DOCTOR);
    expect(result.isNewUser).toBe(false);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('refuses with a development setup error (and creates no user) when the demo doctor is not seeded', async () => {
    process.env = { ...saved, ...DEV };
    const { service, users } = build(null);
    await expect(service.verifyOtp(dto)).rejects.toMatchObject({
      response: { code: 'DEMO_DOCTOR_NOT_SEEDED' },
    });
    await expect(service.verifyOtp(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('refuses when the number already belongs to an ordinary patient account', async () => {
    process.env = { ...saved, ...DEV };
    const stray = { ...demoDoctor, email: null, role: UserRole.PATIENT };
    const { service, tokens } = build(stray);
    await expect(service.verifyOtp(dto)).rejects.toMatchObject({
      response: { code: 'DEMO_DOCTOR_NOT_SEEDED' },
    });
    expect(tokens.generateTokenPair).not.toHaveBeenCalled();
  });

  it('refuses when the demo doctor profile row is missing', async () => {
    process.env = { ...saved, ...DEV };
    const { service } = build(demoDoctor, 0);
    await expect(service.verifyOtp(dto)).rejects.toMatchObject({
      response: { code: 'DEMO_DOCTOR_NOT_SEEDED' },
    });
  });

  it.each([
    [
      'flag disabled in development',
      { NODE_ENV: 'development', DEMO_DOCTOR_LOGIN_ENABLED: 'false', DEMO_DOCTOR_OTP: '246810' },
    ],
    ['production', { ...DEV, NODE_ENV: 'production' }],
    ['staging', { ...DEV, NODE_ENV: 'staging' }],
  ])('rejects demo login: %s', async (_name, env) => {
    process.env = { ...saved, ...env };
    const { service, users, tokens } = build(demoDoctor);
    await expect(service.verifyOtp(dto)).rejects.toMatchObject({
      response: { code: 'DEMO_LOGIN_DISABLED' },
    });
    expect(users.save).not.toHaveBeenCalled();
    expect(tokens.generateTokenPair).not.toHaveBeenCalled();
  });

  it('leaves ordinary phone numbers on the normal path (a new patient is still created)', async () => {
    process.env = { ...saved, NODE_ENV: 'production' };
    const { service, users } = build(null);
    users.create.mockReturnValue({
      id: 'n1',
      phone: '+919876543210',
      role: UserRole.PATIENT,
      isActive: true,
      isVerified: true,
      email: null,
      name: 'x',
      avatarUrl: null,
    });
    users.save.mockImplementation(async (u: unknown) => u);
    const result = await service.verifyOtp({ phone: '+919876543210', otp: '123456' });
    expect(result.isNewUser).toBe(true);
    expect(result.user.role).toBe(UserRole.PATIENT);
  });
});

describe('synthetic video test patient authentication stays development-only', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses the synthetic patient outside the explicitly enabled local setup', async () => {
    const patient = {
      id: 'video-patient',
      phone: '+911111111113',
      email: 'demo-video-patient@staging.invalid',
      name: 'DEMO Video Test Patient',
      role: UserRole.PATIENT,
      isActive: true,
      isVerified: true,
    };
    const users = {
      findOne: jest.fn().mockResolvedValue(patient),
      save: jest.fn(),
      create: jest.fn(),
    };
    const service = new AuthService(
      { verifyOtp: jest.fn() } as never,
      { generateTokenPair: jest.fn() } as never,
      users as never,
    );
    process.env = { ...saved, NODE_ENV: 'production', DEMO_DOCTOR_LOGIN_ENABLED: 'false' };
    await expect(service.verifyOtp({ phone: patient.phone, otp: '123456' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEMO_LOGIN_DISABLED' }),
    });
    expect(users.save).not.toHaveBeenCalled();
  });
});
