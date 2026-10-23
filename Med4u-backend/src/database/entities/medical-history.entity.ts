import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
  Relation,
} from 'typeorm';
import { User } from './user.entity';

export interface SurgeryRecord {
  name: string;
  year: number;
  notes?: string;
}

export interface MedicationRecord {
  name: string;
  dosage: string;
  frequency: string;
  since?: string;
}

export type FamilyRelation = 'father' | 'mother' | 'sibling' | 'grandparent' | 'other';

export interface FamilyHistoryRecord {
  condition: string;
  relation: FamilyRelation;
}

@Entity('medical_histories')
@Index(['userId'])
export class MedicalHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', unique: true })
  userId: string;

  @Column({ type: 'jsonb', default: '[]' })
  allergies: string[];

  @Column({ type: 'jsonb', name: 'chronic_conditions', default: '[]' })
  chronicConditions: string[];

  @Column({ type: 'jsonb', name: 'past_surgeries', default: '[]' })
  pastSurgeries: SurgeryRecord[];

  @Column({ type: 'jsonb', name: 'current_medications', default: '[]' })
  currentMedications: MedicationRecord[];

  @Column({ type: 'jsonb', name: 'family_history', default: '[]' })
  familyHistory: FamilyHistoryRecord[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
