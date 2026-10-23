import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DoctorApplication } from './doctor-application.entity';

export enum ApplicationDocumentKind {
  GRADUATION_CERTIFICATE = 'GRADUATION_CERTIFICATE',
  REGISTRATION_CERTIFICATE = 'REGISTRATION_CERTIFICATE',
}

/** Metadata for one encrypted file. The bytes live in the private document store, addressed by `storageKey`. */
@Entity('doctor_application_documents')
@Index(['applicationId'])
export class DoctorApplicationDocument extends BaseEntity {
  @Column({ type: 'uuid', name: 'application_id' })
  applicationId: string;

  @Column({ type: 'varchar', length: 30 })
  kind: ApplicationDocumentKind;

  @Column({ type: 'varchar', name: 'storage_key', length: 32, unique: true })
  storageKey: string;

  /** Sanitised display name only. It is never used to build a path or a response header. */
  @Column({ type: 'varchar', name: 'original_name', length: 120 })
  originalName: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 40 })
  mimeType: string;

  @Column({ type: 'int', name: 'size_bytes' })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  /** Set when a resubmission replaced this file. */
  @Column({ type: 'timestamptz', name: 'superseded_at', nullable: true })
  supersededAt?: Date | null;

  /** Set when the stored bytes were deleted under the retention policy; the row remains as a record. */
  @Column({ type: 'timestamptz', name: 'purged_at', nullable: true })
  purgedAt?: Date | null;

  @ManyToOne(() => DoctorApplication, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application: Relation<DoctorApplication>;
}
