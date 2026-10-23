import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('otp_codes')
@Index(['phone'])
@Index(['phone', 'isUsed'])
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  code: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'boolean', name: 'is_used', default: false })
  isUsed: boolean;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
