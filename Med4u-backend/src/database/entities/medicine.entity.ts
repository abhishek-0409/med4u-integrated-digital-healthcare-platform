import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Generic } from './generic.entity';
import { Variant } from './variant.entity';

@Entity('brands')
export class Medicine extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  manufacturer?: string;

  /** Stable key used by the catalog seed so re-runs update instead of duplicating. */
  @Column({ type: 'varchar', name: 'catalog_key', length: 100, nullable: true, unique: true })
  catalogKey?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', name: 'image_url', length: 500, nullable: true })
  imageUrl?: string;

  /** Seeded demonstration product; its prices are estimates, not verified retail prices. */
  @Column({ type: 'boolean', name: 'is_demo', default: false })
  isDemo: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', name: 'generic_id' })
  genericId: string;

  @Column({ type: 'boolean', name: 'requires_prescription', default: false })
  requiresPrescription: boolean;

  @ManyToOne(() => Generic, (generic) => generic.medicines, { eager: true })
  @JoinColumn({ name: 'generic_id' })
  generic: Generic;

  @OneToMany(() => Variant, (variant) => variant.medicine)
  variants?: Variant[];
}
