import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { ClinicalPrescription } from '../../database/entities/clinical-prescription.entity';
import { ClinicalPrescriptionEvent } from '../../database/entities/clinical-prescription-event.entity';
import { Doctor } from '../../database/entities/doctor.entity';
import { Notification } from '../../database/entities/notification.entity';
import { Variant } from '../../database/entities/variant.entity';
import { LabTest } from '../../database/entities/lab-test.entity';
import { DevicePushToken } from '../../database/entities/device-push-token.entity';
import { PushDeliveryTicket } from '../../database/entities/push-delivery-ticket.entity';
import { MedicineModule } from '../medicines/medicine.module';
import { ClinicalPrescriptionService } from './clinical-prescription.service';
import {
  DoctorPrescriptionController,
  PatientPrescriptionController,
} from './clinical-prescription.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClinicalPrescription,
      ClinicalPrescriptionEvent,
      Appointment,
      Doctor,
      Variant,
      LabTest,
      Notification,
      DevicePushToken,
      PushDeliveryTicket,
    ]),
    MedicineModule,
  ],
  controllers: [DoctorPrescriptionController, PatientPrescriptionController],
  providers: [ClinicalPrescriptionService],
  exports: [ClinicalPrescriptionService],
})
export class ClinicalPrescriptionModule {}
