import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

import { Generic } from './entities/generic.entity';
import { Medicine } from './entities/medicine.entity';
import { Variant } from './entities/variant.entity';
import { Price } from './entities/price.entity';
import { Doctor } from './entities/doctor.entity';
import { User } from './entities/user.entity';
import { LabTest } from './entities/lab-test.entity';
import { Appointment } from './entities/appointment.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { Prescription } from './entities/prescription.entity';
import { OtpCode } from './entities/otp-code.entity';
import { Session } from './entities/session.entity';
import { Review } from './entities/review.entity';
import { Notification } from './entities/notification.entity';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { LabBooking } from './entities/lab-booking.entity';
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

// Same precedence as the app (app.module.ts: ['.env.local', '.env']). dotenv never overrides a variable that is
// already set, so the first file loaded wins: process env > .env.local > .env.
const root = join(__dirname, '..', '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

const entities = [
  Generic,
  Medicine,
  Variant,
  Price,
  Doctor,
  User,
  LabTest,
  Appointment,
  TimeSlot,
  Prescription,
  OtpCode,
  Session,
  Review,
  Notification,
  NotificationOutbox,
  LabBooking,
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

console.log('Entities Loaded:', entities.map((e) => e.name));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities,
  migrations: [join(__dirname, 'migrations', '**', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
