/**
 * Promotes (or demotes) an existing user to a staff role.  Run with:
 *   npm run user:grant-role -- <phone> <pharmacist|admin|patient>
 * e.g. npm run user:grant-role -- +919876543210 pharmacist
 *
 * Staff accounts are never created through the public OTP login, which only makes patients. The user must
 * sign in once first so the account exists. Takes effect on the user's next request (roles are read from
 * the database on every authenticated call).
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { Client } from 'pg';

config({ path: join(__dirname, '..', '..', '..', '.env') });

const ROLES = ['pharmacist', 'admin', 'patient'] as const;

async function main(): Promise<void> {
  const [phone, role] = process.argv.slice(2);
  if (!phone || !ROLES.includes(role as (typeof ROLES)[number])) {
    console.error(`Usage: npm run user:grant-role -- <phone> <${ROLES.join('|')}>`);
    process.exit(1);
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_ROLE_GRANT_IN_PRODUCTION !== 'true'
  ) {
    console.error(
      'Refusing to change roles with NODE_ENV=production unless ALLOW_ROLE_GRANT_IN_PRODUCTION=true.',
    );
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE users SET role = $1::users_role_enum WHERE phone = $2 AND deleted_at IS NULL RETURNING id, name, role`,
      [role, phone],
    );
    if (result.rowCount === 0) {
      console.error(`No user with phone ${phone}. They must sign in once first.`);
      process.exit(1);
    }
    const user = result.rows[0] as { id: string; name: string; role: string };
    console.log(`${user.name} (${user.id}) is now: ${user.role}`);
  } finally {
    await client.end();
  }
}

void main();
