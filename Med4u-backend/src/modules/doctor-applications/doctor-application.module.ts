import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { DoctorApplicationDocument } from '../../database/entities/doctor-application-document.entity';
import { DoctorApplicationEvent } from '../../database/entities/doctor-application-event.entity';
import { DoctorApplication } from '../../database/entities/doctor-application.entity';
import { User } from '../../database/entities/user.entity';
import { DoctorModule } from '../doctors/doctor.module';
import {
  AdminDoctorApplicationController,
  DoctorApplicationController,
} from './doctor-application.controller';
import { DoctorApplicationService } from './doctor-application.service';
import { DoctorDocumentStorageService } from './doctor-document-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DoctorApplication,
      DoctorApplicationDocument,
      DoctorApplicationEvent,
      Doctor,
      User,
      Appointment,
    ]),
    DoctorModule,
  ],
  controllers: [DoctorApplicationController, AdminDoctorApplicationController],
  providers: [DoctorApplicationService, DoctorDocumentStorageService],
  exports: [DoctorApplicationService],
})
export class DoctorApplicationModule {}
