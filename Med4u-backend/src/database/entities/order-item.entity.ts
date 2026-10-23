import { Entity, Column, Index, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { Variant } from './variant.entity';

/** Line of an order. Product details and prices are snapshots taken at order time. */
@Entity('order_items')
export class OrderItem extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'uuid', name: 'variant_id' })
  variantId: string;

  @Column({ type: 'varchar', name: 'product_name', length: 200 })
  productName: string;

  @Column({ type: 'varchar', name: 'generic_name', length: 200 })
  genericName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strength?: string;

  @Column({ type: 'varchar', length: 50 })
  form: string;

  @Column({ type: 'varchar', name: 'pack_size', length: 100, nullable: true })
  packSize?: string;

  @Column({ type: 'boolean', name: 'requires_prescription' })
  requiresPrescription: boolean;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  mrp: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_price' })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'line_total' })
  lineTotal: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;

  @ManyToOne(() => Variant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: Relation<Variant>;
}
