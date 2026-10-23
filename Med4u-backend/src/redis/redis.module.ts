import { Global, Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (config: ConfigService): Redis => {
    const client = new Redis({
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379),
      password: config.get<string>('redis.password') || undefined,
      db: config.get<number>('redis.db', 0),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    client.on('error', (err: Error) => {
      console.error('[Redis] connection error:', err.message);
    });

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor() {}

  async onApplicationShutdown(): Promise<void> {
    // The client is destroyed via the provider — NestJS calls this on shutdown
  }
}
