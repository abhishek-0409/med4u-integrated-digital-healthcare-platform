import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from '../../database/entities/doctor.entity';
import { MedicalReport } from '../../database/entities/medical-report.entity';
import { Prescription } from '../../database/entities/prescription.entity';
import { PrescriptionUpload } from '../../database/entities/prescription-upload.entity';
import { HealthRecordsController } from './health-records.controller';
import { HealthRecordsService } from './health-records.service';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor, MedicalReport, Prescription, PrescriptionUpload])],
  controllers: [HealthRecordsController],
  providers: [HealthRecordsService],
})
export class HealthRecordsModule {}
