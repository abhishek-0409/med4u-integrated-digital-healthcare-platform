import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Generic } from '../../database/entities/generic.entity';
import { Medicine } from '../../database/entities/medicine.entity';
import { Variant } from '../../database/entities/variant.entity';
import { Price } from '../../database/entities/price.entity';
import { MedicineService } from './medicine.service';
import { PriceService } from './price.service';
import { MedicineController } from './medicine.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Generic, Medicine, Variant, Price])],
  providers: [MedicineService, PriceService],
  controllers: [MedicineController],
  exports: [MedicineService, PriceService],
})
export class MedicineModule {}
