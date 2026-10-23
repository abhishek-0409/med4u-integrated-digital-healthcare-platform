import { makeClinicalPrescription } from "../test/clinicalPrescriptionFixtures";
import { describeDosage, formatPrescriptionDate, prescriptionToText } from "./prescriptionFormat";

describe("describeDosage", () => {
  const base = makeClinicalPrescription().medicines[0];

  it("states dose, route, frequency, duration, timing and food relation", () => {
    expect(describeDosage(base)).toBe("1 tablet, Oral route, three times daily, for 5 days, morning and night, after food");
  });

  it("omits timing and food when they were not specified, and singularises one day", () => {
    expect(describeDosage({ ...base, timing: [], foodRelation: "not_applicable", durationValue: 1, durationUnit: "days" })).toBe(
      "1 tablet, Oral route, three times daily, for 1 day",
    );
  });
});

describe("formatPrescriptionDate", () => {
  it("formats calendar dates without shifting the day", () => {
    expect(formatPrescriptionDate("2026-10-20")).toBe("20 Oct 2026");
    expect(formatPrescriptionDate(null)).toBe("—");
  });
});

describe("prescriptionToText", () => {
  it("includes every medicine detail the patient needs", () => {
    const text = prescriptionToText(makeClinicalPrescription());
    expect(text).toContain("Diagnosis: Viral fever");
    expect(text).toContain("1. Paracetamol 500 mg (tablet)");
    expect(text).toContain("1 tablet, Oral route, three times daily, for 5 days, morning and night, after food");
    expect(text).toContain("Quantity: 15 tablets");
    expect(text).toContain("Follow-up: 5 Nov 2026");
    expect(text).toContain("RX-1A2B3C4D-V1");
  });

  it("includes recommended tests and trusted preparation instructions", () => {
    const rx = makeClinicalPrescription({ recommendedTests: [{ labTestId: "test-1", name: "CBC", preparationInstructions: "No fasting", clinicalInstructions: "Before follow-up" }] });
    const text = prescriptionToText(rx);
    expect(text).toContain("Recommended tests:");
    expect(text).toContain("1. CBC");
    expect(text).toContain("Preparation: No fasting");
  });

  it("never invents registration details or claims a signature", () => {
    const text = prescriptionToText(makeClinicalPrescription());
    expect(text).toContain("Registration details not available");
    expect(text).toContain("not digitally signed");
    expect(text).not.toMatch(/Registration: /);
  });

  it("prints the registration only when it was verified and stored", () => {
    const rx = makeClinicalPrescription();
    const text = prescriptionToText({
      ...rx,
      doctor: { ...rx.doctor, registrationNumber: "REG-123", registrationCouncil: "State Council", registrationVerified: true },
    });
    expect(text).toContain("Registration: REG-123 (State Council)");
  });

  it("marks cancelled and superseded prescriptions so they are not used", () => {
    expect(prescriptionToText(makeClinicalPrescription({ status: "cancelled", cancellationReason: "Wrong patient" }))).toContain("CANCELLED: Wrong patient");
    expect(prescriptionToText(makeClinicalPrescription({ status: "superseded" }))).toContain("Do not use this version");
  });
});
