import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Check,
  Relation,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Doctor } from './doctor.entity';
import { User } from './user.entity';
import { Appointment } from './appointment.entity';

@Entity('reviews')
@Index(['doctorId'])
@Index(['patientId'])
@Index(['doctorId', 'rating'])
@Check('"rating" >= 1 AND "rating" <= 5')
export class Review extends BaseEntity {
  @Column({ type: 'uuid', name: 'doctor_id' })
  doctorId: string;

  @Column({ type: 'uuid', name: 'patient_id' })
  patientId: string;

  @Column({ type: 'uuid', name: 'appointment_id', unique: true })
  appointmentId: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ type: 'boolean', name: 'is_visible', default: true })
  isVisible: boolean;

  @ManyToOne(() => Doctor, (doctor) => doctor.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @ManyToOne(() => User, (user) => user.reviews, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;

  @OneToOne(() => Appointment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Relation<Appointment>;
}
