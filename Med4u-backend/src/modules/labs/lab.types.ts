import { LabBooking } from '../../database/entities/lab-booking.entity';
import { LabTest } from '../../database/entities/lab-test.entity';

export type LabTestDto = Pick<
  LabTest,
  | 'id'
  | 'name'
  | 'category'
  | 'description'
  | 'price'
  | 'turnaroundDays'
  | 'sampleType'
  | 'preparationInstructions'
  | 'homeCollectionAvailable'
  | 'labLocation'
  | 'isDemo'
>;
export type LabBookingDto = Omit<
  Pick<
    LabBooking,
    | 'id'
    | 'testId'
    | 'preferredDate'
    | 'preferredTime'
    | 'homeCollection'
    | 'address'
    | 'status'
    | 'priceSnapshot'
    | 'contactName'
    | 'contactPhone'
    | 'createdAt'
  >,
  'preferredDate'
> & { preferredDate: string; reference: string; test: Pick<LabTest, 'name' | 'category' | 'isDemo'> };
export const labTestDto = (t: LabTest): LabTestDto => ({
  id: t.id,
  name: t.name,
  category: t.category,
  description: t.description,
  price: Number(t.price),
  turnaroundDays: t.turnaroundDays,
  sampleType: t.sampleType,
  preparationInstructions: t.preparationInstructions,
  homeCollectionAvailable: t.homeCollectionAvailable,
  labLocation: t.labLocation,
  isDemo: t.isDemo,
});
/** Human-readable booking reference derived from the id, so no extra column is needed. */
export const labBookingReference = (id: string): string => `LAB-${id.slice(0, 8).toUpperCase()}`;
export const labBookingDto = (b: LabBooking): LabBookingDto => ({
  id: b.id,
  reference: labBookingReference(b.id),
  testId: b.testId,
  preferredDate: String(b.preferredDate).slice(0, 10),
  preferredTime: b.preferredTime,
  homeCollection: b.homeCollection,
  address: b.address,
  status: b.status,
  priceSnapshot: Number(b.priceSnapshot),
  contactName: b.contactName,
  contactPhone: b.contactPhone,
  createdAt: b.createdAt,
  test: {
    name: b.test?.name ?? '',
    category: b.test?.category ?? '',
    isDemo: b.test?.isDemo ?? true,
  },
});
