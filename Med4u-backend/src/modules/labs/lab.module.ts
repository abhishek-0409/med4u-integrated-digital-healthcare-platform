import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTest } from '../../database/entities/lab-test.entity';
import { LabBooking } from '../../database/entities/lab-booking.entity';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [TypeOrmModule.forFeature([LabTest, LabBooking])],
  controllers: [LabController],
  providers: [LabService],
})
export class LabModule {}
