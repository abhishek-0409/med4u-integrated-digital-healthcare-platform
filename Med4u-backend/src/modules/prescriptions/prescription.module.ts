import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { PrescriptionUpload } from '../../database/entities/prescription-upload.entity';
import { OrderModule } from '../orders/order.module';
import { PharmacyPrescriptionController } from './pharmacy-prescription.controller';
import { PrescriptionController } from './prescription.controller';
import { PrescriptionService } from './prescription.service';
import { PrescriptionStorageService } from './prescription-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrescriptionUpload, Order]), OrderModule],
  controllers: [PrescriptionController, PharmacyPrescriptionController],
  providers: [PrescriptionService, PrescriptionStorageService],
  exports: [PrescriptionService],
})
export class PrescriptionModule {}
