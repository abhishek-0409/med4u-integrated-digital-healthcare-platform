import { StagingFixtureGuard } from '../staging-fixture.guard';
import {
  assertStagingEnvironment,
  parseFixturePhones,
  STAGING_DOCTOR_EMAIL,
  STAGING_PATIENT_EMAIL,
} from './staging-fixture';
import {
  bookableWhere,
  isPubliclyVisible,
  isStagingAccount,
  listableSql,
  stagingFixturesEnabled,
} from '../doctor-eligibility';
import { validateEnv } from '../../../config/env.validation';
import { randomBytes } from 'crypto';

const goodEnv = { NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: 'true' } as NodeJS.ProcessEnv;
const localDb = { host: 'localhost', name: 'med4u_db', ssl: false };

describe('assertStagingEnvironment (the guard)', () => {
  it('allows a local development run that opted in and confirmed the database name', () => {
    expect(() => assertStagingEnvironment(goodEnv, localDb, 'med4u_db')).not.toThrow();
    expect(() => assertStagingEnvironment(goodEnv, { ...localDb, host: '127.0.0.1' }, 'med4u_db')).not.toThrow();
  });

  it.each([
    ['production', { ...goodEnv, NODE_ENV: 'production' }],
    ['test', { ...goodEnv, NODE_ENV: 'test' }],
    ['unset', { STAGING_FIXTURES_ENABLED: 'true' }],
    ['no explicit opt-in', { NODE_ENV: 'development' }],
    ['opt-in not exactly "true"', { ...goodEnv, STAGING_FIXTURES_ENABLED: '1' }],
    ['hosting platform marker (Render)', { ...goodEnv, RENDER: 'true' }],
    ['hosting platform marker (DATABASE_URL)', { ...goodEnv, DATABASE_URL: 'postgresql://fixture.invalid/med4u_test' }],
    ['Kubernetes', { ...goodEnv, KUBERNETES_SERVICE_HOST: '10.0.0.1' }],
  ])('refuses when %s', (_label, env) => {
    expect(() => assertStagingEnvironment(env as NodeJS.ProcessEnv, localDb, 'med4u_db')).toThrow(/Refusing to run/);
  });

  it.each([
    ['remote host', { ...localDb, host: 'db.example.com' }],
    ['private network host', { ...localDb, host: '10.0.0.5' }],
    ['no host', { ...localDb, host: undefined }],
    ['ssl enabled', { ...localDb, ssl: true }],
    ['production-looking name', { ...localDb, name: 'med4u_production' }],
    ['no database name', { ...localDb, name: undefined }],
  ])('refuses a database with %s', (_label, db) => {
    expect(() => assertStagingEnvironment(goodEnv, db, db.name)).toThrow(/Refusing to run/);
  });

  it('requires --confirm-db to repeat the exact database name', () => {
    expect(() => assertStagingEnvironment(goodEnv, localDb, undefined)).toThrow(/confirm-db/);
    expect(() => assertStagingEnvironment(goodEnv, localDb, 'other_db')).toThrow(/confirm-db/);
  });

  it('reports every problem at once without echoing secrets', () => {
    try {
      assertStagingEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://fixture.invalid/med4u_test' }, localDb, 'x');
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/NODE_ENV/);
      expect(msg).toMatch(/STAGING_FIXTURES_ENABLED/);
      expect(msg).not.toContain('hunter2');
    }
  });
});

describe('parseFixturePhones', () => {
  it('accepts two distinct Indian mobile numbers', () => {
    expect(parseFixturePhones('+919876543210', '+919876543211')).toEqual({
      doctorPhone: '+919876543210',
      patientPhone: '+919876543211',
    });
  });
  it.each([
    [undefined, '+919876543211'],
    ['+919876543210', undefined],
    ['9876543210', '+919876543211'],
    ['+911234567890', '+919876543211'], // starts with 1: not a valid Indian mobile
    ['+919876543210', '+919876543210'], // same number twice
    ['+447700900001', '+919876543211'],
  ])('rejects %s / %s', (d, p) => {
    expect(() => parseFixturePhones(d, p)).toThrow();
  });
});

describe('staging eligibility rules', () => {
  it('is enabled only in development with an explicit opt-in', () => {
    expect(stagingFixturesEnabled({ NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: 'true' })).toBe(true);
    expect(stagingFixturesEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(stagingFixturesEnabled({ NODE_ENV: 'production', STAGING_FIXTURES_ENABLED: 'true' })).toBe(false);
    expect(stagingFixturesEnabled({ NODE_ENV: 'test', STAGING_FIXTURES_ENABLED: 'true' })).toBe(false);
    expect(stagingFixturesEnabled({})).toBe(false);
  });

  it('recognises only reserved .invalid addresses as staging accounts', () => {
    expect(isStagingAccount(STAGING_DOCTOR_EMAIL)).toBe(true);
    expect(isStagingAccount(STAGING_PATIENT_EMAIL.toUpperCase())).toBe(true);
    expect(isStagingAccount('someone@example.invalid')).toBe(false);
    expect(isStagingAccount('staging@example.invalid')).toBe(false);
    expect(isStagingAccount(null)).toBe(false);
    expect(isStagingAccount(undefined)).toBe(false);
  });

  it('adds fixtures to listing and booking only when allowed', () => {
    expect(listableSql('d', false)).not.toContain('isStagingFixture');
    expect(listableSql('d', true)).toContain('d.isStagingFixture = true');
    expect(bookableWhere('id1', false)).toHaveLength(2);
    expect(bookableWhere('id1', true)).toContainEqual({ id: 'id1', isStagingFixture: true });
  });

  it('shows a fixture only when allowed, and never affects verified or demo doctors', () => {
    const fixture = { isVerified: false, isDemo: false, isStagingFixture: true };
    expect(isPubliclyVisible(fixture, false)).toBe(false);
    expect(isPubliclyVisible(fixture, true)).toBe(true);
    expect(isPubliclyVisible({ isVerified: true, isDemo: false, isStagingFixture: false }, false)).toBe(true);
    expect(isPubliclyVisible({ isVerified: false, isDemo: true, isStagingFixture: false }, false)).toBe(true);
    expect(isPubliclyVisible({ isVerified: false, isDemo: false, isStagingFixture: false }, true)).toBe(false);
  });
});

describe('production safety rails', () => {
  const base = () => ({
    DB_HOST: 'localhost',
    DB_USERNAME: 'u',
    DB_PASSWORD: randomBytes(24).toString('base64'),
    DB_NAME: 'd',
    JWT_SECRET: randomBytes(48).toString('base64'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('base64'),
  });

  it('config validation rejects STAGING_FIXTURES_ENABLED in production, allows it in development', () => {
    expect(() => validateEnv({ ...base(), NODE_ENV: 'production', STAGING_FIXTURES_ENABLED: 'true' })).toThrow(/STAGING_FIXTURES_ENABLED/);
    expect(() => validateEnv({ ...base(), NODE_ENV: 'development', STAGING_FIXTURES_ENABLED: 'true' })).not.toThrow();
    expect(() => validateEnv({ ...base(), NODE_ENV: 'production' })).not.toThrow();
  });

  it('the boot guard refuses to start in production if any fixture row exists', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const guard = new StagingFixtureGuard({ count } as never);
    await expect(guard.assertNoFixturesInProduction('production')).rejects.toThrow(/staging test doctor/);
    expect(count).toHaveBeenCalledWith({ where: { isStagingFixture: true }, withDeleted: true });
  });

  it('the boot guard passes in production with no fixtures, and does not even query outside production', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const guard = new StagingFixtureGuard({ count } as never);
    await expect(guard.assertNoFixturesInProduction('production')).resolves.toBeUndefined();
    count.mockClear();
    await expect(guard.assertNoFixturesInProduction('development')).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
  });
});
