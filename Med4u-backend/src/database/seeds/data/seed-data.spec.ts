import { DEMO_CATEGORIES, DEMO_MEDICINES, describeDemoMedicine } from './medicines.demo';
import { DEMO_DOCTORS, FEE_RANGES } from './doctors.demo';
import { toPaise } from '../../../common/utils/money.util';

describe('demo medicine catalog', () => {
  it('has roughly 100 products with unique stable keys', () => {
    expect(DEMO_MEDICINES.length).toBeGreaterThanOrEqual(80);
    expect(DEMO_MEDICINES.length).toBeLessThanOrEqual(120);
    const keys = DEMO_MEDICINES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has valid money and stock values', () => {
    for (const m of DEMO_MEDICINES) {
      expect(() => toPaise(m.mrp)).not.toThrow();
      expect(() => toPaise(m.sellingPrice)).not.toThrow();
      expect(m.mrp).toBeGreaterThan(0);
      expect(m.sellingPrice).toBeGreaterThan(0);
      expect(toPaise(m.sellingPrice)).toBeLessThanOrEqual(toPaise(m.mrp));
      expect(Number.isInteger(m.stock)).toBe(true);
      expect(m.stock).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not apply one uniform discount to everything', () => {
    const ratios = new Set(DEMO_MEDICINES.map((m) => (m.sellingPrice / m.mrp).toFixed(3)));
    expect(ratios.size).toBeGreaterThan(3);
    expect(DEMO_MEDICINES.some((m) => m.sellingPrice === m.mrp)).toBe(true);
  });

  it('uses known categories and keeps each generic in a single category', () => {
    const generics = new Map<string, string>();
    for (const m of DEMO_MEDICINES) {
      expect(DEMO_CATEGORIES).toContain(m.category);
      expect(generics.get(m.generic) ?? m.category).toBe(m.category);
      generics.set(m.generic, m.category);
    }
    for (const c of DEMO_CATEGORIES) {
      expect(DEMO_MEDICINES.some((m) => m.category === c)).toBe(true);
    }
  });

  it('marks the whole chronic-care category and known Rx-only drugs as prescription-required', () => {
    for (const m of DEMO_MEDICINES.filter((x) => x.category === 'Chronic Care')) {
      expect(m.requiresPrescription).toBe(true);
    }
    const rxOnly =
      /pantoprazole|omeprazole|domperidone|levocetirizine|fexofenadine|montelukast|framycetin|clotrimazole|ambroxol/i;
    for (const m of DEMO_MEDICINES.filter((x) => rxOnly.test(x.generic))) {
      expect(m.requiresPrescription).toBe(true);
    }
  });

  it('excludes controlled / restricted substances', () => {
    const restricted =
      /tramadol|codeine|morphine|alprazolam|diazepam|clonazepam|zolpidem|tapentadol|ketamine|methadone|fentanyl|pseudoephedrine/i;
    for (const m of DEMO_MEDICINES) {
      expect(`${m.brand} ${m.generic}`).not.toMatch(restricted);
    }
  });

  it('writes neutral descriptions without dosing instructions', () => {
    for (const m of DEMO_MEDICINES) {
      const text = describeDemoMedicine(m);
      expect(text).not.toMatch(/\b(take|dose|dosage|twice|daily|safe for)\b/i);
      expect(text).toContain('consult a doctor or pharmacist');
    }
  });
});

describe('demo doctors', () => {
  it('assigns explicit gender values to the fictional demo doctor records', () => {
    expect(DEMO_DOCTORS.every((doctor) => doctor.gender === 'male' || doctor.gender === 'female')).toBe(true);
    expect(DEMO_DOCTORS.some((doctor) => doctor.gender === 'male')).toBe(true);
    expect(DEMO_DOCTORS.some((doctor) => doctor.gender === 'female')).toBe(true);
  });

  it('has 30-40 doctors with unique keys and names', () => {
    expect(DEMO_DOCTORS.length).toBeGreaterThanOrEqual(30);
    expect(DEMO_DOCTORS.length).toBeLessThanOrEqual(40);
    expect(new Set(DEMO_DOCTORS.map((d) => d.key)).size).toBe(DEMO_DOCTORS.length);
    expect(new Set(DEMO_DOCTORS.map((d) => d.name)).size).toBe(DEMO_DOCTORS.length);
  });

  it('keeps fees inside the specialty band and never invents registration numbers', () => {
    for (const d of DEMO_DOCTORS) {
      const range = FEE_RANGES[d.specialization];
      expect(range).toBeDefined();
      expect(d.fee).toBeGreaterThanOrEqual(range[0]);
      expect(d.fee).toBeLessThanOrEqual(range[1]);
      expect(d.key).toMatch(/^DEMO-DOC-\d{3}$/);
      expect(d.bio).toMatch(/^Demo profile/);
      expect(d.experienceYears).toBeGreaterThanOrEqual(0);
      expect(Object.keys(d.schedule).length).toBeGreaterThan(0);
    }
  });

  it('covers at least ten specialties', () => {
    expect(new Set(DEMO_DOCTORS.map((d) => d.specialization)).size).toBeGreaterThanOrEqual(10);
  });
});
