export const DOSAGE_FORMS = [
  "tablet", "capsule", "syrup", "suspension", "injection", "drops", "ointment",
  "cream", "gel", "lotion", "inhaler", "powder", "spray", "patch", "other",
] as const;
export const ROUTES = [
  "oral", "sublingual", "topical", "inhalation", "nasal", "ophthalmic", "otic",
  "rectal", "vaginal", "intramuscular", "subcutaneous", "intravenous", "other",
] as const;
export const FOOD_RELATIONS = ["not_applicable", "before_food", "after_food", "with_food", "empty_stomach"] as const;
export const TIMINGS = ["morning", "afternoon", "evening", "night"] as const;
export const DURATION_UNITS = ["days", "weeks", "months"] as const;

export type DosageForm = (typeof DOSAGE_FORMS)[number];
export type MedicineRoute = (typeof ROUTES)[number];
export type FoodRelation = (typeof FOOD_RELATIONS)[number];
export type Timing = (typeof TIMINGS)[number];
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type PrescriptionStatus = "draft" | "issued" | "superseded" | "cancelled";

/** A medicine as stored by the server. */
export interface PrescribedMedicine {
  catalogMedicineId: string | null;
  source: "catalog" | "manual";
  name: string;
  genericName: string | null;
  strength: string;
  dosageForm: DosageForm;
  dose: string;
  route: MedicineRoute;
  frequency: string;
  durationValue: number;
  durationUnit: DurationUnit;
  quantity: number;
  quantityUnit: string | null;
  timing: Timing[];
  foodRelation: FoodRelation;
  instructions: string | null;
}

export interface PrescribedTest {
  labTestId: string;
  name: string;
  preparationInstructions: string | null;
  clinicalInstructions: string | null;
}

export interface CatalogLabTest {
  id: string;
  name: string;
  category: string;
  isDemo: boolean;
}

export interface DoctorSnapshot {
  name: string;
  specialization: string;
  clinicName: string | null;
  registrationNumber: string | null;
  registrationCouncil: string | null;
  registrationVerified: boolean;
  isDemo: boolean;
}

export interface DoctorPrescription {
  id: string;
  reference: string;
  status: PrescriptionStatus;
  version: number;
  revision: number;
  diagnosis: string | null;
  medicines: PrescribedMedicine[];
  recommendedTests: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
  consultation: { appointmentId: string; date: string; startTime: string; endTime: string };
  patient: { id: string; name: string };
  issuedAt: string | null;
  doctor: DoctorSnapshot;
  supersedesId: string | null;
  supersededById: string | null;
  amendmentReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  digitallySigned: false;
}

export interface PrescriptionEligibility { canPrescribe: boolean; code: string | null; message: string | null }
export interface AppointmentPrescriptionState {
  eligibility: PrescriptionEligibility;
  draft: DoctorPrescription | null;
  issued: DoctorPrescription | null;
}
export interface IssueResult { prescription: DoctorPrescription; alreadyIssued: boolean }

export interface CatalogProduct {
  id: string;
  name: string;
  genericName: string;
  strength: string | null;
  form: string;
  isDemo: boolean;
}

/** Strings the doctor is typing. Converted to a typed payload only when valid. */
export interface MedicineForm {
  key: string;
  catalogMedicineId: string | null;
  catalogIsSample: boolean;
  name: string;
  strength: string;
  dosageForm: DosageForm | "";
  dose: string;
  route: MedicineRoute | "";
  frequency: string;
  durationValue: string;
  durationUnit: DurationUnit;
  quantity: string;
  quantityUnit: string;
  timing: Timing[];
  foodRelation: FoodRelation;
  instructions: string;
}

export interface PrescriptionForm {
  diagnosis: string;
  medicines: MedicineForm[];
  recommendedTests: Array<{ key: string; labTestId: string; name: string; category: string; isDemo: boolean; clinicalInstructions: string }>;
  additionalInstructions: string;
  warnings: string;
  followUpDate: string;
}

export interface SaveDraftPayload {
  baseRevision?: number | null;
  diagnosis: string | null;
  medicines: Array<{
    catalogMedicineId: string | null;
    name: string;
    strength: string;
    dosageForm: DosageForm;
    dose: string;
    route: MedicineRoute;
    frequency: string;
    durationValue: number;
    durationUnit: DurationUnit;
    quantity: number;
    quantityUnit: string | null;
    timing: Timing[];
    foodRelation: FoodRelation;
    instructions: string | null;
  }>;
  recommendedTests: Array<{ labTestId: string; clinicalInstructions: string | null }>;
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
}
