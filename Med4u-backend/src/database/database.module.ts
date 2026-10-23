import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Doctor } from './entities/doctor.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { Appointment } from './entities/appointment.entity';
import { Prescription } from './entities/prescription.entity';
import { OtpCode } from './entities/otp-code.entity';
import { Session } from './entities/session.entity';
import { Review } from './entities/review.entity';
import { Notification } from './entities/notification.entity';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { LabTest } from './entities/lab-test.entity';
import { LabBooking } from './entities/lab-booking.entity';
import { Generic } from './entities/generic.entity';
import { Medicine } from './entities/medicine.entity';
import { Variant } from './entities/variant.entity';
import { Price } from './entities/price.entity';
import { MedicalHistory } from './entities/medical-history.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PrescriptionUpload } from './entities/prescription-upload.entity';
import { OrderEvent } from './entities/order-event.entity';
import { MedicalReport } from './entities/medical-report.entity';
import { DoctorApplication } from './entities/doctor-application.entity';
import { DoctorApplicationDocument } from './entities/doctor-application-document.entity';
import { DoctorApplicationEvent } from './entities/doctor-application-event.entity';
import { ClinicalPrescription } from './entities/clinical-prescription.entity';
import { ClinicalPrescriptionEvent } from './entities/clinical-prescription-event.entity';
import { DevicePushToken } from './entities/device-push-token.entity';
import { PushDeliveryTicket } from './entities/push-delivery-ticket.entity';

export const ALL_ENTITIES = [
  User,
  Doctor,
  TimeSlot,
  Appointment,
  Prescription,
  OtpCode,
  Session,
  Review,
  Notification,
  NotificationOutbox,
  LabTest,
  LabBooking,
  Generic,
  Medicine,
  Variant,
  Price,
  MedicalHistory,
  Order,
  OrderItem,
  PrescriptionUpload,
  OrderEvent,
  MedicalReport,
  DoctorApplication,
  DoctorApplicationDocument,
  DoctorApplicationEvent,
  ClinicalPrescription,
  ClinicalPrescriptionEvent,
  DevicePushToken,
  PushDeliveryTicket,
];

@Module({
  imports: [TypeOrmModule.forFeature(ALL_ENTITIES)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
