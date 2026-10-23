import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { RazorpayService } from './razorpay.service';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment])],
  controllers: [AppointmentController],
  providers: [AppointmentService, RazorpayService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
