import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity('medical_reports')
@Index(['patientId', 'createdAt'])
export class MedicalReport extends BaseEntity {
  @Column({ type: 'uuid', name: 'patient_id' }) patientId: string;
  @Column({ type: 'uuid', name: 'uploaded_by' }) uploadedBy: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'varchar', length: 80 }) category: string;
  @Column({ type: 'varchar', name: 'storage_key', length: 64, unique: true }) storageKey: string;
  @Column({ type: 'varchar', name: 'mime_type', length: 50 }) mimeType: string;
  @Column({ type: 'int', name: 'size_bytes' }) sizeBytes: number;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @Column({ type: 'varchar', length: 20, default: 'uploaded' }) status: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<User>;
}
