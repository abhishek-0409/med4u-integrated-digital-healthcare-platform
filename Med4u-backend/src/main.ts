import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';

const TOO_MANY_REQUESTS_BODY = {
  success: false,
  data: null,
  error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' },
};

/** Socket.IO adapter that applies the same CORS policy as the REST API. */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origin: string | boolean,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, credentials: true },
    });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // ── Logger ──────────────────────────────────────────────────────────────
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const swaggerEnabled = config.get<boolean>('SWAGGER_ENABLED', true);

  // ── Security middleware ─────────────────────────────────────────────────
  app.use(helmet());

  app.use(
    rateLimit({
      windowMs: config.get<number>('THROTTLE_TTL', 60) * 1000,
      max: config.get<number>('THROTTLE_LIMIT', 100),
      message: TOO_MANY_REQUESTS_BODY,
    }),
  );

  // Stricter per-IP limit on login endpoints (OTP send/verify, token refresh).
  app.use(
    '/api/v1/auth',
    rateLimit({
      windowMs: config.get<number>('AUTH_THROTTLE_TTL', 60) * 1000,
      max: config.get<number>('AUTH_THROTTLE_LIMIT', 20),
      message: TOO_MANY_REQUESTS_BODY,
    }),
  );

  app.enableCors({
    origin: nodeEnv === 'production' ? frontendUrl : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useWebSocketAdapter(
    new CorsIoAdapter(
      app,
      nodeEnv === 'production' ? config.get<string>('WS_CORS_ORIGIN', frontendUrl) : true,
    ),
  );

  // ── Global pipe (class-validator DTOs — ZodValidationPipe used per-route) ─
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global prefix & Swagger ─────────────────────────────────────────────
  app.setGlobalPrefix('api');

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Med4U API')
      .setDescription('Production-grade healthcare application REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization' },
        'access-token',
      )
      .addTag('auth', 'OTP login, token refresh, logout')
      .addTag('users', 'User profile management')
      .addTag('doctors', 'Doctor profiles and availability')
      .addTag('appointments', 'Booking and scheduling')
      .addTag('prescriptions', 'Prescription upload and retrieval')
      .addTag('pharmacy', 'Pharmacist back office: order lifecycle and prescription review')
      .addTag('lab-tests', 'Lab tests and bookings')
      .addTag('medicines', 'Medicine catalogue')
      .addTag('notifications', 'In-app and push notifications')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    logger.log(`Swagger → http://localhost:${port}/api/docs`, 'Bootstrap');
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`Med4U API → http://localhost:${port}/api  [${nodeEnv}]`, 'Bootstrap');
  logger.log(
    `Connected DB: ${config.get<string>('DB_NAME', 'med4u_db')} @ ${config.get<string>('DB_HOST', 'localhost')}`,
    'Bootstrap',
  );
}

void bootstrap();
