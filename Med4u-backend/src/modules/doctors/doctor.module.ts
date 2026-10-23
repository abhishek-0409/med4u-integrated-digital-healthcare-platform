import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from '../../database/entities/doctor.entity';
import { TimeSlot } from '../../database/entities/time-slot.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { DoctorRepository } from './doctor.repository';
import { TimeSlotRepository } from './time-slot.repository';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { StagingFixtureGuard } from './staging-fixture.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor, TimeSlot, Appointment])],
  providers: [DoctorRepository, TimeSlotRepository, DoctorService, StagingFixtureGuard],
  controllers: [DoctorController],
  exports: [DoctorRepository, DoctorService],
})
export class DoctorModule {}
