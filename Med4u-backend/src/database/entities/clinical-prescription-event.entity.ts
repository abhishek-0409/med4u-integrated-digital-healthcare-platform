import { Entity, Column, Index, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

export type ClinicalPrescriptionAction =
  | 'draft_created'
  | 'draft_updated'
  | 'draft_discarded'
  | 'issued'
  | 'amendment_started'
  | 'amendment_issued'
  | 'superseded'
  | 'cancelled';

/** Append-only audit trail (the database rejects UPDATE and DELETE on this table). */
@Entity('clinical_prescription_events')
@Index(['prescriptionId', 'createdAt'])
export class ClinicalPrescriptionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'prescription_id' })
  prescriptionId: string;

  @Column({ type: 'uuid', name: 'appointment_id' })
  appointmentId: string;

  /** The authenticated user that performed the action. */
  @Column({ type: 'uuid', name: 'actor_user_id' })
  actorUserId: string;

  @Column({ type: 'varchar', length: 40 })
  action: ClinicalPrescriptionAction;

  @Column({ type: 'varchar', name: 'from_status', length: 20, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', name: 'to_status', length: 20, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
