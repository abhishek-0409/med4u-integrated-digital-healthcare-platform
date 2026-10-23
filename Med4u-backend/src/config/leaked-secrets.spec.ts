import { randomBytes } from 'crypto';
import { findLeakedSecrets } from './leaked-secrets';
import { validateEnv } from './env.validation';

const random = () => randomBytes(48).toString('hex');

describe('environment secret placeholder checks', () => {
  it('accepts generated values for guarded keys', () => {
    expect(
      findLeakedSecrets({
        DB_PASSWORD: random(),
        REDIS_PASSWORD: random(),
        JWT_SECRET: random(),
        JWT_REFRESH_SECRET: random(),
        CONSULTATION_TOKEN_SECRET: random(),
        ENCRYPTION_KEY: random(),
      }),
    ).toEqual([]);
  });

  it('rejects template placeholders without returning their values', () => {
    const problems = findLeakedSecrets({
      JWT_SECRET: 'CHANGE_ME_USE_A_LOCAL_SECRET_VALUE',
      ENCRYPTION_KEY: 'CHANGE_ME_USE_A_LOCAL_SECRET_VALUE',
    });
    expect(problems).toHaveLength(2);
    expect(problems.join()).not.toContain('CHANGE_ME');
  });

  it('does not apply the required-secret placeholder rule to unguarded optional settings', () => {
    expect(findLeakedSecrets({ REDIS_PASSWORD: 'local-only-placeholder' })).toEqual([]);
  });

  it('allows a separately configured previous encryption key during a controlled rotation', () => {
    expect(findLeakedSecrets({ ENCRYPTION_KEY_PREVIOUS: random() })).toEqual([]);
  });
});

describe('environment validation', () => {
  const base = () => ({
    DB_HOST: 'localhost',
    DB_USERNAME: 'local',
    DB_PASSWORD: random(),
    DB_NAME: 'med4u_test',
    JWT_SECRET: random(),
    JWT_REFRESH_SECRET: random(),
  });

  it('accepts local values that meet validation rules', () => {
    expect(() => validateEnv(base())).not.toThrow();
  });

  it('rejects template placeholders without exposing their values', () => {
    expect(() => validateEnv({ ...base(), JWT_SECRET: 'CHANGE_ME_USE_A_LOCAL_SECRET_VALUE' })).toThrow(
      /Refusing to start/,
    );
  });
});
