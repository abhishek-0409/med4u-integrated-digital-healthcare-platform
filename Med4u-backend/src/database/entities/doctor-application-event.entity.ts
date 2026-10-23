import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ApplicationEventAction {
  SUBMITTED = 'SUBMITTED',
  RESUBMITTED = 'RESUBMITTED',
  REVIEW_STARTED = 'REVIEW_STARTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  INFO_REQUESTED = 'INFO_REQUESTED',
  DOCUMENT_VIEWED = 'DOCUMENT_VIEWED',
}

/** Append-only audit trail. A database trigger rejects UPDATE and DELETE on this table. */
@Entity('doctor_application_events')
@Index(['applicationId', 'createdAt'])
export class DoctorApplicationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'application_id' })
  applicationId: string;

  @Column({ type: 'uuid', name: 'actor_user_id' })
  actorUserId: string;

  @Column({ type: 'varchar', name: 'actor_role', length: 20 })
  actorRole: string;

  @Column({ type: 'varchar', length: 24 })
  action: ApplicationEventAction;

  @Column({ type: 'varchar', name: 'from_status', length: 24, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', name: 'to_status', length: 24, nullable: true })
  toStatus?: string | null;

  /** Internal note (reviewer only). */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** What the applicant was told. */
  @Column({ type: 'text', name: 'applicant_message', nullable: true })
  applicantMessage?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
