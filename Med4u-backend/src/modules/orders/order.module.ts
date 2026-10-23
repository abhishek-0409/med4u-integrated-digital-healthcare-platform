import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { PrescriptionUpload } from '../../database/entities/prescription-upload.entity';
import { MedicineModule } from '../medicines/medicine.module';
import { OrderController } from './order.controller';
import { PharmacyOrderController } from './pharmacy-order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderEvent, PrescriptionUpload]),
    MedicineModule,
  ],
  controllers: [OrderController, PharmacyOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
