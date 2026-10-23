import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from '../../database/entities/doctor.entity';
import { Medicine } from '../../database/entities/medicine.entity';
import { Generic } from '../../database/entities/generic.entity';
import { Variant } from '../../database/entities/variant.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { User } from '../../database/entities/user.entity';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import { DebugController } from './debug.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Doctor,
      Medicine,
      Generic,
      Variant,
      Appointment,
      User,
      TimeSlot,
    ]),
  ],
  controllers: [DebugController],
})
export class DebugModule {}
