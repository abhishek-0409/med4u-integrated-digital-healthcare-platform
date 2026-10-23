import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Relation,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Medicine } from './medicine.entity';
import { Price } from './price.entity';

@Entity('variants')
export class Variant extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'medicine_id' })
  medicineId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strength?: string;

  @Column({ type: 'varchar', length: 50 })
  form: string;

  @Column({ type: 'varchar', name: 'pack_size', length: 100, nullable: true })
  packSize?: string;

  @Column({ type: 'int', name: 'stock_quantity', default: 0 })
  stockQuantity: number;

  @ManyToOne(() => Medicine, (medicine) => medicine.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicine_id' })
  medicine: Relation<Medicine>;

  @OneToMany(() => Price, (price) => price.variant)
  prices?: Relation<Price[]>;
}
