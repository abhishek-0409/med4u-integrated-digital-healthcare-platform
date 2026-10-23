import { z } from 'zod';
import { findLeakedSecrets } from './leaked-secrets';
import {
  demoDoctorConfigProblem,
  demoVideoTestPatientConfigProblem,
} from '../modules/auth/demo-doctor';

// z.coerce.boolean() treats "false" as true (Boolean("false") = true).
// Use this helper for all env boolean flags.
const envBool = (defaultVal: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(defaultVal);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default('Med4U'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SSL: envBool(false),
  DB_SYNC: envBool(false),
  DB_LOGGING: envBool(false),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_TTL: z.coerce.number().default(3600),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CONSULTATION_TOKEN_SECRET: z.string().min(32).optional(),
  /** coturn REST API shared secret; produces short-lived HMAC credentials for clients. */
  TURN_SHARED_SECRET: z.string().min(32).optional(),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),

  /** Encrypts prescription files at rest (AES-256-GCM). Prescription upload/download refuse to run without it. */
  ENCRYPTION_KEY: z.string().min(32).optional(),
  /** Identifies ENCRYPTION_KEY in the file header (1-255). Bump it on every rotation. */
  ENCRYPTION_KEY_ID: z.coerce.number().int().min(1).max(255).default(1),
  /** The key being rotated out; kept until every file is re-encrypted. */
  ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),
  /** 0 = files written before key ids existed. */
  ENCRYPTION_KEY_PREVIOUS_ID: z.coerce.number().int().min(0).max(255).default(0),
  /** Encrypts doctor-application documents (AES-256-GCM). Independent of ENCRYPTION_KEY. Uploads refuse to run without it. */
  DOCUMENT_ENCRYPTION_KEY: z.string().min(32).optional(),
  DOCUMENT_ENCRYPTION_KEY_ID: z.coerce.number().int().min(1).max(255).default(1),
  /** Private directory for encrypted doctor-application documents. Never served statically. */
  DOCTOR_DOCUMENT_STORAGE_DIR: z.string().optional(),
  /** Development-only demo doctor login for +911111111112. Rejected anywhere but NODE_ENV=development. */
  DEMO_DOCTOR_LOGIN_ENABLED: envBool(false),
  DEMO_DOCTOR_OTP: z.string().regex(/^\d{6}$/, 'Must be exactly 6 digits').optional(),
  /** Backend-only SMS delivery credentials. Empty/unset keeps patient OTP delivery disabled. */
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  /** Backend-only local test account allowlist. Never expose this value to apps or API responses. */
  DEMO_VIDEO_TEST_PATIENT_USER_ID: z.string().uuid().optional(),
  /** Private directory for encrypted prescription files. Never served statically. */
  PRESCRIPTION_STORAGE_DIR: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  PRIVATE_FILES_DIR: z.string().optional(),

  /** Razorpay checkout secrets are backend-only; all three are required to enable payment. */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  THROTTLE_TTL: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(100),
  AUTH_THROTTLE_TTL: z.coerce.number().default(60),
  AUTH_THROTTLE_LIMIT: z.coerce.number().default(20),
  WS_CORS_ORIGIN: z.string().optional(),

  SWAGGER_ENABLED: envBool(true),
  DEBUG_ROUTES_ENABLED: envBool(false),
  /** Development only: lets fictional staging test doctors be listed and booked. Rejected in production. */
  STAGING_FIXTURES_ENABLED: envBool(false),
  LOG_LEVEL: z.string().default('debug'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  if (result.data.NODE_ENV === 'production' && result.data.STAGING_FIXTURES_ENABLED) {
    throw new Error('STAGING_FIXTURES_ENABLED must not be set when NODE_ENV=production.');
  }
  const demoProblem = demoDoctorConfigProblem({
    ...process.env,
    ...(config as Record<string, string>),
    DEMO_DOCTOR_LOGIN_ENABLED: String(result.data.DEMO_DOCTOR_LOGIN_ENABLED),
    NODE_ENV: result.data.NODE_ENV,
  });
  if (demoProblem) throw new Error(demoProblem);
  const patientProblem = demoVideoTestPatientConfigProblem({
    ...process.env,
    ...(config as Record<string, string>),
    DEMO_DOCTOR_LOGIN_ENABLED: String(result.data.DEMO_DOCTOR_LOGIN_ENABLED),
    NODE_ENV: result.data.NODE_ENV,
    DEMO_VIDEO_TEST_PATIENT_USER_ID: result.data.DEMO_VIDEO_TEST_PATIENT_USER_ID,
    DB_HOST: result.data.DB_HOST,
    DB_SSL: String(result.data.DB_SSL),
  });
  if (patientProblem) throw new Error(patientProblem);
  if (
    result.data.DOCUMENT_ENCRYPTION_KEY &&
    result.data.DOCUMENT_ENCRYPTION_KEY === result.data.ENCRYPTION_KEY
  ) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY must differ from ENCRYPTION_KEY.');
  }
  const leaked = findLeakedSecrets(result.data as unknown as Record<string, unknown>);
  if (leaked.length > 0) {
    throw new Error(
      ['Refusing to start with compromised or placeholder secrets:', ...leaked.map((l) => `  ${l}`)].join('\n'),
    );
  }
  return result.data;
}
