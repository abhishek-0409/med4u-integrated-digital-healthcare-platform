import { MedicineProduct } from './medicine.types';
import { classifyPrescriptionMatches, maxPacksForPrescription, PrescribedMedicineForMatch } from './prescription-matching';

const rx: PrescribedMedicineForMatch = {
  catalogMedicineId: null,
  source: 'manual',
  name: 'Paracetamol',
  genericName: 'Paracetamol',
  strength: '500 mg',
  dosageForm: 'tablet',
  route: 'oral',
  quantity: 20,
  quantityUnit: 'tablets',
};

const product = (over: Partial<MedicineProduct> = {}): MedicineProduct => ({
  id: 'variant-1', brandId: 'brand-1', name: 'Aceta', genericName: 'Paracetamol', category: 'Pain',
  manufacturer: null, strength: '500mg', form: 'Tablet', packSize: '10 tablets', description: null,
  imageUrl: null, requiresPrescription: false, isDemo: false, stockStatus: 'IN_STOCK',
  maxOrderQuantity: 10, purchasable: true,
  price: { mrp: 20, sellingPrice: 18, discountPercent: 10, source: 'catalog', isEstimate: false, updatedAt: '2026-01-01T00:00:00.000Z' },
  ...over,
});

describe('prescription-to-catalog matching', () => {
  it('matches on active ingredient, normalized strength, form and compatible route', () => {
    const result = classifyPrescriptionMatches(rx, [product()]);
    expect(result.status).toBe('MATCHED');
    expect(result.candidates[0]).toMatchObject({ id: 'variant-1', maxPrescriptionQuantity: 2, quantityUnitKnown: true });
  });

  it('does not substitute a different strength or dosage form', () => {
    const result = classifyPrescriptionMatches(rx, [
      product({ id: 'wrong-strength', strength: '250 mg' }),
      product({ id: 'wrong-form', form: 'Capsule' }),
    ]);
    expect(result.status).toBe('NEEDS_PHARMACIST_REVIEW');
    expect(result.candidates).toHaveLength(0);
  });

  it('returns all equally matched products as explicit alternatives instead of choosing one silently', () => {
    const result = classifyPrescriptionMatches(rx, [product(), product({ id: 'variant-2', name: 'Para', brandId: 'brand-2' })]);
    expect(result.status).toBe('MATCHED');
    expect(result.candidates.map((p) => p.id)).toEqual(['variant-1', 'variant-2']);
  });

  it('reports unmatched active ingredient as unavailable', () => {
    const result = classifyPrescriptionMatches(rx, [product({ genericName: 'Ibuprofen' })]);
    expect(result).toEqual({ status: 'UNAVAILABLE', candidates: [] });
  });

  it('requires pharmacist review when package quantity cannot be reconciled safely', () => {
    const result = classifyPrescriptionMatches({ ...rx, quantityUnit: null }, [product()]);
    expect(result.status).toBe('NEEDS_PHARMACIST_REVIEW');
    expect(result.candidates[0].quantityUnitKnown).toBe(false);
  });

  it('reads common catalog pack descriptions without confusing the units', () => {
    expect(maxPacksForPrescription({ quantity: 30, quantityUnit: 'tablets' }, 'Strip of 10 tablets')).toEqual({ quantity: 3, unitKnown: true });
    expect(maxPacksForPrescription({ quantity: 30, quantityUnit: 'tablets' }, 'Strip of 10 dispersible tablets')).toEqual({ quantity: 3, unitKnown: true });
    expect(maxPacksForPrescription({ quantity: 60, quantityUnit: 'ml' }, 'Bottle of 60 ml')).toEqual({ quantity: 1, unitKnown: true });
  });
});
