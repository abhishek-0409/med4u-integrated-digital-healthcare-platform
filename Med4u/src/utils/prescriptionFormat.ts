import { ClinicalMedicine, ClinicalPrescription } from "../types/clinical-prescription";

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const FOOD_LABEL: Record<ClinicalMedicine["foodRelation"], string> = {
  not_applicable: "Not applicable",
  before_food: "Before food",
  after_food: "After food",
  with_food: "With food",
  empty_stomach: "On an empty stomach",
};
const TIMING_LABEL: Record<ClinicalMedicine["timing"][number], string> = {
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  night: "night",
};

export const medicineTitle = (m: Pick<ClinicalMedicine, "name" | "strength" | "dosageForm">) =>
  `${m.name} ${m.strength} (${m.dosageForm})`;

/** The one-line instruction a patient reads: dose, route, frequency, duration, timing and food. */
export function describeDosage(
  m: Pick<ClinicalMedicine, "dose" | "route" | "frequency" | "durationValue" | "durationUnit" | "timing" | "foodRelation">,
): string {
  const unit = m.durationValue === 1 ? m.durationUnit.replace(/s$/, "") : m.durationUnit;
  let text = [m.dose, `${titleCase(m.route)} route`, m.frequency.toLowerCase(), `for ${m.durationValue} ${unit}`].join(", ");
  if (m.timing.length) text += `, ${m.timing.map((t) => TIMING_LABEL[t]).join(" and ")}`;
  if (m.foodRelation !== "not_applicable") text += `, ${FOOD_LABEL[m.foodRelation].toLowerCase()}`;
  return text;
}

export function formatPrescriptionDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Asia/Kolkata",
  });
}

export const STATUS_LABEL: Record<ClinicalPrescription["status"], string> = {
  issued: "Issued",
  superseded: "Replaced by a corrected prescription",
  cancelled: "Cancelled",
};

/** Plain-text rendering of the document, used for the share sheet. Mirrors the on-screen sheet exactly. */
export function prescriptionToText(rx: ClinicalPrescription): string {
  const lines: string[] = [];
  lines.push("Med4U · Prescription");
  lines.push(`Reference: ${rx.reference}   Status: ${STATUS_LABEL[rx.status]}`);
  if (rx.doctor.isDemo) lines.push("DEMO · SYNTHETIC PRESCRIPTION · NOT FOR DISPENSING");
  if (rx.status === "cancelled") lines.push(`CANCELLED${rx.cancellationReason ? `: ${rx.cancellationReason}` : ""}`);
  if (rx.status === "superseded") lines.push("A corrected prescription replaces this one. Do not use this version.");
  lines.push("");
  lines.push(`${rx.doctor.name}, ${rx.doctor.specialization}${rx.doctor.clinicName ? `, ${rx.doctor.clinicName}` : ""}`);
  lines.push(
    rx.doctor.registrationVerified && rx.doctor.registrationNumber
      ? `Registration: ${rx.doctor.registrationNumber}${rx.doctor.registrationCouncil ? ` (${rx.doctor.registrationCouncil})` : ""}`
      : "Registration details not available",
  );
  lines.push("");
  lines.push(`Patient: ${rx.patient.name}`);
  lines.push(`Consultation: ${formatPrescriptionDate(rx.consultation.date)}   Issued: ${formatPrescriptionDate(rx.issuedAt)}`);
  lines.push("");
  lines.push(`Diagnosis: ${rx.diagnosis ?? "—"}`);
  lines.push("");
  lines.push("Medicines:");
  rx.medicines.forEach((m, i) => {
    lines.push(`${i + 1}. ${medicineTitle(m)}`);
    if (m.genericName) lines.push(`   Generic: ${m.genericName}`);
    lines.push(`   ${describeDosage(m)}`);
    lines.push(`   Quantity: ${m.quantity}${m.quantityUnit ? ` ${m.quantityUnit}` : ""}`);
    if (m.instructions) lines.push(`   Note: ${m.instructions}`);
  });
  lines.push("", "Recommended tests:");
  if (rx.recommendedTests?.length) {
    rx.recommendedTests.forEach((test, i) => {
      lines.push(`${i + 1}. ${test.name}`);
      if (test.preparationInstructions) lines.push(`   Preparation: ${test.preparationInstructions}`);
      if (test.clinicalInstructions) lines.push(`   Doctor's note: ${test.clinicalInstructions}`);
    });
  } else {
    lines.push("None recommended.");
  }
  if (rx.additionalInstructions) lines.push("", `Additional instructions: ${rx.additionalInstructions}`);
  if (rx.warnings) lines.push("", `Warnings: ${rx.warnings}`);
  if (rx.followUpDate) lines.push("", `Follow-up: ${formatPrescriptionDate(rx.followUpDate)}`);
  lines.push("", "Issued electronically through Med4U. This document is not digitally signed.");
  return lines.join("\n");
}
