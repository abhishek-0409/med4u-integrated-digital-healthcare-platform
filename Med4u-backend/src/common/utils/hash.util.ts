import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashString(str: string): Promise<string> {
  return bcrypt.hash(str, SALT_ROUNDS);
}

export async function compareHash(str: string, hash: string): Promise<boolean> {
  return bcrypt.compare(str, hash);
}
