import { Entity, Column, Index, ManyToOne, JoinColumn, OneToMany, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Doctor } from './doctor.entity';
import { Appointment } from './appointment.entity';

@Entity('time_slots')
@Index(['doctorId', 'date'])
@Index(['doctorId', 'isBooked'])
// Slots are generated lazily from the doctor's schedule; this keeps concurrent generation idempotent.
@Index('UQ_time_slots_doctor_date_start', ['doctorId', 'date', 'startTime'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class TimeSlot extends BaseEntity {
  @Column({ type: 'uuid', name: 'doctor_id' })
  doctorId: string;

  /** Calendar date as 'YYYY-MM-DD' (clinic-local), exactly as Postgres returns it. */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'time', name: 'start_time' })
  startTime: string;

  @Column({ type: 'time', name: 'end_time' })
  endTime: string;

  @Column({ type: 'boolean', name: 'is_booked', default: false })
  isBooked: boolean;

  @ManyToOne(() => Doctor, (doctor) => doctor.timeSlots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @OneToMany(() => Appointment, (appointment) => appointment.slot)
  appointments?: Relation<Appointment[]>;
}
