/** Reject secret placeholders before the backend starts. Never include secret values in diagnostics. */
const GUARDED_KEYS = [
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CONSULTATION_TOKEN_SECRET',
  'ENCRYPTION_KEY',
  'DOCUMENT_ENCRYPTION_KEY',
] as const;

const isTemplatePlaceholder = (value: string): boolean => /^CHANGE_ME/i.test(value.trim());

export function findLeakedSecrets(config: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of GUARDED_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || value === '') continue;
    if (isTemplatePlaceholder(value)) problems.push(key);
  }
  return problems;
}
