import { MedicineProduct } from './medicine.types';

export interface PrescribedMedicineForMatch {
  catalogMedicineId: string | null;
  source: 'catalog' | 'manual';
  name: string;
  genericName: string | null;
  strength: string;
  dosageForm: string;
  route: string;
  quantity: number;
  quantityUnit: string | null;
}

export interface PrescriptionCandidate extends MedicineProduct {
  maxPrescriptionQuantity: number;
  quantityUnitKnown: boolean;
}

export type PrescriptionMatchStatus = 'MATCHED' | 'UNAVAILABLE' | 'NEEDS_PHARMACIST_REVIEW';

const normalized = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const formGroup = (v: string): string => {
  const n = normalized(v);
  if (['tablet', 'tablets', 'tab'].includes(n)) return 'tablet';
  if (['capsule', 'capsules', 'cap'].includes(n)) return 'capsule';
  if (['syrup', 'suspension', 'liquid'].includes(n)) return 'liquid';
  if (['injection', 'injectable'].includes(n)) return 'injection';
  if (['drops', 'drop'].includes(n)) return 'drops';
  if (['ointment', 'cream', 'gel', 'lotion', 'patch'].includes(n)) return n;
  if (['inhaler', 'powder'].includes(n)) return n;
  if (['spray', 'nasalspray'].includes(n)) return 'spray';
  return n;
};

const routeFitsForm = (route: string, form: string): boolean => {
  const r = normalized(route);
  const f = formGroup(form);
  if (['tablet', 'capsule', 'liquid'].includes(f)) return r === 'oral';
  if (f === 'injection') return ['intramuscular', 'subcutaneous', 'intravenous'].includes(r);
  if (['ointment', 'cream', 'gel', 'lotion', 'patch'].includes(f)) return r === 'topical';
  if (f === 'inhaler') return r === 'inhalation';
  if (f === 'spray') return r === 'nasal';
  if (f === 'drops') return ['ophthalmic', 'otic'].includes(r);
  return false;
};

/** Match exact clinical attributes. A doctor-selected catalog id additionally pins the brand/variant. */
export function matchesPrescriptionProduct(
  prescribed: PrescribedMedicineForMatch,
  product: MedicineProduct,
): boolean {
  if (prescribed.catalogMedicineId && product.id !== prescribed.catalogMedicineId) return false;
  const expectedIngredient = normalized(prescribed.genericName || prescribed.name);
  const productIngredient = normalized(product.genericName);
  const ingredientMatches = expectedIngredient === productIngredient ||
    (!prescribed.genericName && expectedIngredient === normalized(product.name));
  return Boolean(prescribed.catalogMedicineId || ingredientMatches) &&
    normalized(prescribed.strength) === normalized(product.strength) &&
    formGroup(prescribed.dosageForm) === formGroup(product.form) &&
    routeFitsForm(prescribed.route, product.form);
}

const quantityUnit = (v: string | null | undefined): string => {
  const n = normalized(v);
  const aliases: Record<string, string> = {
    tablet: 'tablet', tablets: 'tablet', tab: 'tablet', tabs: 'tablet',
    capsule: 'capsule', capsules: 'capsule', cap: 'capsule', caps: 'capsule',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
    gram: 'gram', grams: 'gram', g: 'gram',
    unit: 'unit', units: 'unit', piece: 'piece', pieces: 'piece',
  };
  return aliases[n] ?? '';
};

/** Package limits are derived only when both prescribed and catalog pack units are explicit. */
export function maxPacksForPrescription(
  prescribed: Pick<PrescribedMedicineForMatch, 'quantity' | 'quantityUnit'>,
  packSize: string | null,
): { quantity: number; unitKnown: boolean } {
  const units = packSize?.match(/\d+(?:\s+[a-zA-Z]+){0,2}/g) ?? [];
  let packCount = 0;
  let packUnit = '';
  for (const part of units) {
    const tokens = part.trim().split(/\s+/);
    const count = Number(tokens.shift());
    const recognizedUnits = tokens.map(quantityUnit).filter(Boolean);
    const recognized = recognizedUnits[recognizedUnits.length - 1] ?? '';
    if (count > 0 && recognized) { packCount = count; packUnit = recognized; break; }
  }
  const prescribedUnit = quantityUnit(prescribed.quantityUnit);
  if (!packCount || !prescribedUnit || prescribedUnit !== packUnit) return { quantity: 1, unitKnown: false };
  return { quantity: Math.max(0, Math.floor(prescribed.quantity / packCount)), unitKnown: true };
}

export function classifyPrescriptionMatches(
  prescribed: PrescribedMedicineForMatch,
  products: MedicineProduct[],
): { status: PrescriptionMatchStatus; candidates: PrescriptionCandidate[] } {
  const matched = products.filter((p) => matchesPrescriptionProduct(prescribed, p));
  const candidates = matched.map((product) => {
    const limit = maxPacksForPrescription(prescribed, product.packSize);
    return { ...product, maxPrescriptionQuantity: limit.quantity, quantityUnitKnown: limit.unitKnown };
  });
  if (!candidates.length) {
    const identityMatches = products.some((product) =>
      prescribed.catalogMedicineId
        ? product.id === prescribed.catalogMedicineId
        : normalized(prescribed.genericName || prescribed.name) === normalized(product.genericName),
    );
    return { status: identityMatches ? 'NEEDS_PHARMACIST_REVIEW' : 'UNAVAILABLE', candidates: [] };
  }
  if (candidates.every((candidate) => !candidate.purchasable || candidate.maxPrescriptionQuantity === 0)) {
    return { status: 'NEEDS_PHARMACIST_REVIEW', candidates };
  }
  if (candidates.every((candidate) => !candidate.quantityUnitKnown)) {
    return { status: 'NEEDS_PHARMACIST_REVIEW', candidates };
  }
  return { status: 'MATCHED', candidates };
}
