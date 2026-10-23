import Redis from 'ioredis';

/** The API caches doctor lists for up to an hour; drop them so imports and verifications show at once. */
export async function clearDoctorCaches(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doctors:*', 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.del(keys);
    } while (cursor !== '0');
    console.log('Cleared doctor API caches in Redis.');
  } catch (err) {
    console.warn(`Could not clear Redis caches (${(err as Error).message}); lists may lag up to 1 hour.`);
  } finally {
    redis.disconnect();
  }
}
