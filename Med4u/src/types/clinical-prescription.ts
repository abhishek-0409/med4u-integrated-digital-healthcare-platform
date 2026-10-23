/** A prescription written by a doctor after a consultation. Drafts are never sent to the patient app. */
export type ClinicalPrescriptionStatus = "issued" | "superseded" | "cancelled";

export interface ClinicalMedicine {
  name: string;
  genericName: string | null;
  strength: string;
  dosageForm: string;
  dose: string;
  route: string;
  frequency: string;
  durationValue: number;
  durationUnit: "days" | "weeks" | "months";
  quantity: number;
  quantityUnit: string | null;
  timing: Array<"morning" | "afternoon" | "evening" | "night">;
  foodRelation: "before_food" | "after_food" | "with_food" | "empty_stomach" | "not_applicable";
  instructions: string | null;
}

export interface ClinicalRecommendedTest {
  labTestId: string;
  name: string;
  preparationInstructions: string | null;
  clinicalInstructions: string | null;
}

export interface ClinicalPrescription {
  id: string;
  /** Printed identifier, e.g. RX-1A2B3C4D-V1. */
  reference: string;
  status: ClinicalPrescriptionStatus;
  version: number;
  diagnosis: string | null;
  medicines: ClinicalMedicine[];
  recommendedTests: ClinicalRecommendedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
  consultation: { appointmentId: string; date: string; startTime: string; endTime: string };
  patient: { name: string; age: number | null; gender: string | null };
  issuedAt: string;
  doctor: {
    name: string;
    specialization: string;
    clinicName: string | null;
    /** Present only when the doctor's registration was verified and stored. */
    registrationNumber: string | null;
    registrationCouncil: string | null;
    registrationVerified: boolean;
    isDemo: boolean;
  };
  supersededById: string | null;
  amendmentReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** Always false: the document carries no digital signature. */
  digitallySigned: false;
}
