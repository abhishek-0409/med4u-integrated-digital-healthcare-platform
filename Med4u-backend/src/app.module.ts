import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import cloudinaryConfig from './config/cloudinary.config';
import { validateEnv } from './config/env.validation';
import { winstonConfig } from './common/utils/logger.util';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/user.module';
import { MedicineModule } from './modules/medicines/medicine.module';
import { DoctorModule } from './modules/doctors/doctor.module';
import { DebugModule } from './modules/debug/debug.module';
import { AppointmentModule } from './modules/appointments/appointment.module';
import { ConsultationModule } from './modules/consultations/consultation.module';
import { OrderModule } from './modules/orders/order.module';
import { PrescriptionModule } from './modules/prescriptions/prescription.module';
import { LabModule } from './modules/labs/lab.module';
import { HealthRecordsModule } from './modules/health-records/health-records.module';
import { DoctorApplicationModule } from './modules/doctor-applications/doctor-application.module';
import { ClinicalPrescriptionModule } from './modules/clinical-prescriptions/clinical-prescription.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [databaseConfig, redisConfig, jwtConfig, cloudinaryConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => winstonConfig(config),
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('database') as Record<string, unknown>,
    }),

    // Infrastructure (global providers available to all modules)
    RedisModule,
    DatabaseModule,
    CommonModule,

    // Feature modules
    AuthModule,
    UserModule,
    MedicineModule,
    DoctorModule,
    AppointmentModule,
    DebugModule,
    ConsultationModule,
    OrderModule,
    PrescriptionModule,
    LabModule,
    HealthRecordsModule,
    DoctorApplicationModule,
    ClinicalPrescriptionModule,
    NotificationsModule,
  ],
})
export class AppModule {}
