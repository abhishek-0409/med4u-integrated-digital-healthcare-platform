import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Medicine } from './medicine.entity';

@Entity('generics')
export class Generic extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 200, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @OneToMany(() => Medicine, (medicine) => medicine.generic)
  medicines: Medicine[];
}
