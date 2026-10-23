import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Appointment } from '../../database/entities/appointment.entity';
import { User } from '../../database/entities/user.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';
import { SocketGateway } from '../../socket/socket.gateway';
import { SocketAuthMiddleware } from '../../socket/socket.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, User, Doctor]),

    // JwtService used for signing room tokens and verifying socket auth
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: '7d' },
      }),
    }),

    ConfigModule,
  ],
  controllers: [ConsultationController],
  providers: [
    ConsultationService,
    SocketGateway,
    SocketAuthMiddleware,
  ],
  exports: [ConsultationService],
})
export class ConsultationModule {}
