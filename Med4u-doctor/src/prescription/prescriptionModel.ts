import {
  CatalogProduct,
  DOSAGE_FORMS,
  DosageForm,
  FoodRelation,
  MedicineRoute,
  MedicineForm,
  PrescribedMedicine,
  PrescribedTest,
  PrescriptionForm,
  SaveDraftPayload,
  Timing,
} from "../types/prescription";

export const FREQUENCY_PRESETS = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "At bedtime",
  "Every 8 hours",
  "Every 12 hours",
  "As needed (SOS)",
] as const;

export const FOOD_LABEL: Record<FoodRelation, string> = {
  not_applicable: "Not applicable",
  before_food: "Before food",
  after_food: "After food",
  with_food: "With food",
  empty_stomach: "On an empty stomach",
};
export const TIMING_LABEL: Record<Timing, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" };
export const titleCase = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

let counter = 0;
export const newKey = () => `m${Date.now().toString(36)}${(counter += 1)}`;

export const emptyMedicine = (): MedicineForm => ({
  key: newKey(),
  catalogMedicineId: null,
  catalogIsSample: false,
  name: "",
  strength: "",
  dosageForm: "",
  dose: "",
  route: "",
  frequency: "",
  durationValue: "",
  durationUnit: "days",
  quantity: "",
  quantityUnit: "",
  timing: [],
  foodRelation: "not_applicable",
  instructions: "",
});

export const emptyForm = (): PrescriptionForm => ({
  diagnosis: "",
  medicines: [],
  recommendedTests: [],
  additionalInstructions: "",
  warnings: "",
  followUpDate: "",
});

export function formFromServer(rx: {
  diagnosis: string | null;
  medicines: PrescribedMedicine[];
  recommendedTests?: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
}): PrescriptionForm {
  return {
    diagnosis: rx.diagnosis ?? "",
    medicines: rx.medicines.map((m) => ({
      key: newKey(),
      catalogMedicineId: m.catalogMedicineId,
      catalogIsSample: false,
      name: m.name,
      strength: m.strength,
      dosageForm: m.dosageForm,
      dose: m.dose,
      route: m.route,
      frequency: m.frequency,
      durationValue: String(m.durationValue),
      durationUnit: m.durationUnit,
      quantity: String(m.quantity),
      quantityUnit: m.quantityUnit ?? "",
      timing: [...m.timing],
      foodRelation: m.foodRelation,
      instructions: m.instructions ?? "",
    })),
    recommendedTests: (rx.recommendedTests ?? []).map((t) => ({
      key: newKey(), labTestId: t.labTestId, name: t.name, category: "", isDemo: false,
      clinicalInstructions: t.clinicalInstructions ?? "",
    })),
    additionalInstructions: rx.additionalInstructions ?? "",
    warnings: rx.warnings ?? "",
    followUpDate: rx.followUpDate ?? "",
  };
}

/** Maps a catalog dosage form ("Tablet", "Syrup 100ml") onto the supported list; anything unknown is left for the doctor. */
export function dosageFormFromCatalog(form: string): DosageForm | "" {
  const lower = form.trim().toLowerCase();
  return DOSAGE_FORMS.find((f) => lower === f || lower.startsWith(`${f} `) || lower.startsWith(`${f}s`)) ?? "";
}

/** Picking a catalog entry only prefills identity fields. Dose, route, frequency and duration stay the doctor's call. */
export function applyCatalogProduct(form: MedicineForm, product: CatalogProduct): MedicineForm {
  return {
    ...form,
    catalogMedicineId: product.id,
    catalogIsSample: product.isDemo,
    name: product.name,
    strength: product.strength ?? form.strength,
    dosageForm: dosageFormFromCatalog(product.form) || form.dosageForm,
  };
}

export type MedicineErrors = Partial<Record<"name" | "strength" | "dosageForm" | "dose" | "route" | "frequency" | "durationValue" | "quantity", string>>;

const positiveInt = (value: string): number | null => (/^\d{1,5}$/.test(value.trim()) && Number(value) > 0 ? Number(value) : null);

export function validateMedicine(m: MedicineForm): MedicineErrors {
  const errors: MedicineErrors = {};
  if (m.name.trim().length < 2) errors.name = "Enter the medicine name.";
  else if (m.name.trim().length > 200) errors.name = "Keep the name under 200 characters.";
  if (!m.strength.trim()) errors.strength = "Enter the strength, for example 500 mg.";
  if (!m.dosageForm) errors.dosageForm = "Choose the dosage form.";
  if (!m.dose.trim()) errors.dose = "Enter the dose per administration, for example 1 tablet.";
  if (!m.route) errors.route = "Choose the route.";
  if (!m.frequency.trim()) errors.frequency = "Choose or enter how often to take it.";
  const duration = positiveInt(m.durationValue);
  if (duration === null || duration > 365) errors.durationValue = "Enter a duration from 1 to 365.";
  const quantity = positiveInt(m.quantity);
  if (quantity === null || quantity > 9999) errors.quantity = "Enter the total quantity to dispense.";
  return errors;
}

export function validateFollowUp(value: string, today: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return "Use the format YYYY-MM-DD.";
  if (v < today) return "The follow-up date cannot be in the past.";
  return null;
}

export interface ReviewProblems { diagnosis?: string; medicines?: string; followUpDate?: string; perMedicine: Record<string, MedicineErrors> }

/** Rules that must hold before the prescription can be reviewed and issued. */
export function validateForReview(form: PrescriptionForm, today: string): ReviewProblems {
  const problems: ReviewProblems = { perMedicine: {} };
  if (!form.diagnosis.trim()) problems.diagnosis = "Enter the diagnosis or clinical assessment.";
  for (const m of form.medicines) {
    const errors = validateMedicine(m);
    if (Object.keys(errors).length) problems.perMedicine[m.key] = errors;
  }
  const followUp = validateFollowUp(form.followUpDate, today);
  if (followUp) problems.followUpDate = followUp;
  return problems;
}

export const hasProblems = (p: ReviewProblems) => Boolean(p.diagnosis || p.medicines || p.followUpDate || Object.keys(p.perMedicine).length);

/**
 * Builds the draft payload. Medicines that are still incomplete are left out (the editor keeps them locally),
 * so a draft save never fails because the doctor is half-way through typing an entry.
 */
export function toDraftPayload(form: PrescriptionForm): SaveDraftPayload {
  const medicines = form.medicines
    .filter((m) => Object.keys(validateMedicine(m)).length === 0)
    .map((m) => ({
      catalogMedicineId: m.catalogMedicineId,
      name: m.name.trim(),
      strength: m.strength.trim(),
      dosageForm: m.dosageForm as DosageForm,
      dose: m.dose.trim(),
      route: m.route as MedicineRoute,
      frequency: m.frequency.trim(),
      durationValue: Number(m.durationValue),
      durationUnit: m.durationUnit,
      quantity: Number(m.quantity),
      quantityUnit: m.quantityUnit.trim() || null,
      timing: m.timing,
      foodRelation: m.foodRelation,
      instructions: m.instructions.trim() || null,
    }));
  return {
    diagnosis: form.diagnosis.trim() || null,
    medicines,
    recommendedTests: form.recommendedTests.map(({ labTestId, clinicalInstructions }) => ({
      labTestId, clinicalInstructions: clinicalInstructions.trim() || null,
    })),
    additionalInstructions: form.additionalInstructions.trim() || null,
    warnings: form.warnings.trim() || null,
    followUpDate: form.followUpDate.trim() || null,
  };
}

/** One-line, patient-readable dosing sentence, shared by the review screen and the issued view. */
export function describeDosage(m: Pick<PrescribedMedicine, "dose" | "route" | "frequency" | "durationValue" | "durationUnit" | "timing" | "foodRelation">): string {
  const parts = [`${m.dose}`, `${titleCase(m.route)} route`, m.frequency.toLowerCase()];
  parts.push(`for ${m.durationValue} ${m.durationValue === 1 ? m.durationUnit.replace(/s$/, "") : m.durationUnit}`);
  let text = parts.join(", ");
  if (m.timing.length) text += `, ${m.timing.map((t) => TIMING_LABEL[t].toLowerCase()).join(" and ")}`;
  if (m.foodRelation !== "not_applicable") text += `, ${FOOD_LABEL[m.foodRelation].toLowerCase()}`;
  return text;
}

export function medicineTitle(m: Pick<PrescribedMedicine, "name" | "strength" | "dosageForm">): string {
  return `${m.name} ${m.strength} (${m.dosageForm})`;
}

/** Stable comparison so the editor can tell whether there is anything unsaved. */
export const formSignature = (form: PrescriptionForm): string => JSON.stringify({ ...form, medicines: form.medicines.map(({ key, ...rest }) => rest) });
