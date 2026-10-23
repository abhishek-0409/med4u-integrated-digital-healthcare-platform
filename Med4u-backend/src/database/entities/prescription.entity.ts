import { Entity, Column, Index, OneToOne, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Appointment } from './appointment.entity';
import { Doctor } from './doctor.entity';
import { User } from './user.entity';

export enum FileType {
  PDF = 'pdf',
  IMAGE = 'image',
}

@Entity('prescriptions')
@Index(['doctorId'])
@Index(['patientId'])
@Index(['appointmentId'])
export class Prescription extends BaseEntity {
  @Column({ type: 'uuid', name: 'appointment_id', unique: true })
  appointmentId: string;

  @Column({ type: 'uuid', name: 'doctor_id' })
  doctorId: string;

  @Column({ type: 'uuid', name: 'patient_id' })
  patientId: string;

  @Column({ type: 'varchar', name: 'file_url' })
  fileUrl: string;

  @Column({ type: 'enum', enum: FileType, name: 'file_type', default: FileType.PDF })
  fileType: FileType;

  @Column({ type: 'varchar', name: 'public_id', nullable: true })
  publicId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToOne(() => Appointment, (appointment) => appointment.prescription, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Relation<Appointment>;

  @ManyToOne(() => Doctor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;
}
