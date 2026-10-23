import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Relation,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Variant } from './variant.entity';

export enum PriceSource {
  MYUPCHAR = 'MYUPCHAR',
  SCRAPER = 'SCRAPER',
  MANUAL = 'MANUAL',
  /** Illustrative seed price. Not a verified retail price. */
  DEMO_ESTIMATE = 'DEMO_ESTIMATE',
}

@Entity('prices')
@Unique(['variantId', 'source'])
export class Price extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'variant_id' })
  variantId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  mrp: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'final_price' })
  finalPrice: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'discount_percent',
    default: 0,
  })
  discountPercent: number;

  @Column({ type: 'enum', enum: PriceSource, default: PriceSource.MANUAL })
  source: PriceSource;

  @Column({ type: 'timestamptz', name: 'last_updated', default: () => 'NOW()' })
  lastUpdated: Date;

  @ManyToOne(() => Variant, (variant) => variant.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: Relation<Variant>;
}
