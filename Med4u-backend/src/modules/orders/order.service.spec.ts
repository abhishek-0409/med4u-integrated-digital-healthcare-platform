import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { ClinicalPrescription, ClinicalPrescriptionStatus } from '../../database/entities/clinical-prescription.entity';
import { UserRole } from '../../database/entities/user.entity';
import { MedicineService } from '../medicines/medicine.service';
import { OrderService } from './order.service';

describe('OrderService prescription safety', () => {
  it('lets an authorized pharmacist approve a current clinical prescription order and records the review in order history', async () => {
    const order = {
      id: 'order-1', userId: 'patient-1', status: OrderStatus.PENDING_REVIEW,
      clinicalPrescriptionId: 'rx-1', prescriptionId: null, paymentStatus: 'UNPAID',
      total: '9.00', isDemo: false, deliveryAddress: '1 Main Street, Pune - 411001',
      deliveryName: 'Patient', deliveryPhone: '+919876543210', deliveryCity: 'Pune', deliveryPincode: '411001',
      items: [{ variantId: 'variant-1', productName: 'Medicine', genericName: 'Ingredient', strength: '10 mg', form: 'tablet', packSize: '10 tablets', requiresPrescription: true, quantity: 1, mrp: '10.00', unitPrice: '9.00', lineTotal: '9.00' }],
      events: [],
      clinicalPrescription: { id: 'rx-1', version: 1, status: ClinicalPrescriptionStatus.ISSUED, diagnosis: 'Assessment', medicines: [], recommendedTests: [] },
    };
    const clinicalPrescription = { id: 'rx-1', status: ClinicalPrescriptionStatus.ISSUED };
    const eventRows: Array<Record<string, unknown>> = [];
    const em = {
      findOne: jest.fn(async (entity: unknown, options: { select?: unknown }) => {
        if (entity === Order && options.select) return { id: order.id, prescriptionId: null, clinicalPrescriptionId: 'rx-1' };
        if (entity === Order) return order;
        if (entity === ClinicalPrescription) return clinicalPrescription;
        return null;
      }),
      find: jest.fn(async (entity: unknown) => entity === OrderItem ? order.items : []),
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: unknown, value: Record<string, unknown>) => value),
      save: jest.fn(async (entityOrValue: unknown, value?: Record<string, unknown>) => {
        const saved = value ?? entityOrValue as Record<string, unknown>;
        if (saved.toStatus) eventRows.push(saved);
        return saved;
      }),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: EntityManager) => Promise<unknown>) => work(em as unknown as EntityManager)),
    } as unknown as DataSource;
    const orders = { findOne: jest.fn().mockResolvedValue(order) } as unknown as Repository<Order>;
    const service = new OrderService(dataSource, orders, {} as MedicineService);

    const result = await service.staffUpdateStatus(
      { id: 'staff-1', role: UserRole.PHARMACIST },
      order.id,
      { status: OrderStatus.CONFIRMED, note: 'Clinical prescription reviewed and approved' },
    );

    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(eventRows[0]).toMatchObject({ actorId: 'staff-1', actorRole: UserRole.PHARMACIST, fromStatus: OrderStatus.PENDING_REVIEW, toStatus: OrderStatus.CONFIRMED });
  });

  it('rejects prescription-only products without a prescription before changing stock or creating an order', async () => {
    const variantId = 'c87fce0d-6ca8-461f-a80c-146f3c3f817a';
    const entityManager = {
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      save: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: EntityManager) => Promise<unknown>) =>
        work(entityManager as unknown as EntityManager),
      ),
    } as unknown as DataSource;
    const medicineService = {
      findForPurchase: jest.fn().mockResolvedValue(
        new Map([
          [
            variantId,
            {
              product: {
                name: 'Demo prescription medicine',
                genericName: 'Demo generic',
                strength: '10 mg',
                form: 'tablet',
                packSize: 'Pack of 10',
                requiresPrescription: true,
                isDemo: true,
                price: {
                  mrp: 10,
                  sellingPrice: 9,
                  discountPercent: 10,
                  source: 'DEMO_ESTIMATE',
                  isEstimate: true,
                  updatedAt: new Date(),
                },
              },
              stockQuantity: 5,
              mrpPaise: 1000,
              sellingPaise: 900,
            },
          ],
        ]),
      ),
    } as unknown as MedicineService;
    const service = new OrderService(dataSource, {} as Repository<Order>, medicineService);

    let thrown: unknown;
    try {
      await service.create('15c32157-733a-45a7-b5b9-50af5ec24e9a', {
        items: [{ variantId, quantity: 1 }],
        delivery: {
          name: 'Test Patient',
          phone: '+919876543210',
          line1: '12 Test Street',
          city: 'Pune',
          pincode: '411001',
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'PRESCRIPTION_REQUIRED',
    });
    expect(entityManager.query).toHaveBeenCalledTimes(1); // the row lock only
    expect(entityManager.save).not.toHaveBeenCalled();
  });
});
