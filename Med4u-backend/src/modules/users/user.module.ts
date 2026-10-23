import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { MedicalHistory } from '../../database/entities/medical-history.entity';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, MedicalHistory])],
  providers: [UserRepository, UserService],
  controllers: [UserController],
  // Export UserRepository so other modules (e.g. AppointmentsModule) can query users
  exports: [UserRepository, UserService],
})
export class UserModule {}
