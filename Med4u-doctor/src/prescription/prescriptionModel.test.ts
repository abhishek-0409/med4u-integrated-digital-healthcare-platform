import {
  applyCatalogProduct,
  describeDosage,
  dosageFormFromCatalog,
  emptyForm,
  emptyMedicine,
  formSignature,
  hasProblems,
  toDraftPayload,
  validateFollowUp,
  validateForReview,
  validateMedicine,
} from "./prescriptionModel";
import { MedicineForm } from "../types/prescription";

const complete = (over: Partial<MedicineForm> = {}): MedicineForm => ({
  ...emptyMedicine(),
  name: "Paracetamol",
  strength: "500 mg",
  dosageForm: "tablet",
  dose: "1 tablet",
  route: "oral",
  frequency: "Three times daily",
  durationValue: "5",
  quantity: "15",
  ...over,
});

describe("medicine validation", () => {
  it("requires every clinically essential field and never defaults them", () => {
    const errors = validateMedicine(emptyMedicine());
    expect(Object.keys(errors).sort()).toEqual(["dosageForm", "dose", "durationValue", "frequency", "name", "quantity", "route", "strength"]);
  });

  it("accepts a complete entry and rejects out-of-range numbers", () => {
    expect(validateMedicine(complete())).toEqual({});
    expect(validateMedicine(complete({ durationValue: "0" })).durationValue).toBeTruthy();
    expect(validateMedicine(complete({ durationValue: "400" })).durationValue).toBeTruthy();
    expect(validateMedicine(complete({ quantity: "abc" })).quantity).toBeTruthy();
    expect(validateMedicine(complete({ name: " " })).name).toBeTruthy();
  });
});

describe("review rules", () => {
  it("requires a diagnosis but permits a prescription with neither medicines nor tests", () => {
    const problems = validateForReview(emptyForm(), "2026-10-23");
    expect(hasProblems(problems)).toBe(true);
    expect(problems.diagnosis).toBeTruthy();
    expect(problems.medicines).toBeUndefined();
    expect(hasProblems(validateForReview({ ...emptyForm(), diagnosis: "Assessment only" }, "2026-10-23"))).toBe(false);
  });

  it("flags incomplete medicines per entry and passes a complete prescription", () => {
    const bad = complete({ dose: "" });
    const problems = validateForReview({ ...emptyForm(), diagnosis: "Fever", medicines: [bad, complete()] }, "2026-10-23");
    expect(Object.keys(problems.perMedicine)).toEqual([bad.key]);
    expect(hasProblems(validateForReview({ ...emptyForm(), diagnosis: "Fever", medicines: [complete()] }, "2026-10-23"))).toBe(false);
  });

  it("validates the follow-up date format and rejects the past", () => {
    expect(validateFollowUp("", "2026-10-23")).toBeNull();
    expect(validateFollowUp("2026-11-02", "2026-10-23")).toBeNull();
    expect(validateFollowUp("2026-10-01", "2026-10-23")).toMatch(/past/);
    expect(validateFollowUp("02/11/2026", "2026-10-23")).toMatch(/YYYY-MM-DD/);
    expect(validateFollowUp("2026-02-31", "2026-10-23")).toMatch(/YYYY-MM-DD/);
  });
});

describe("draft payload", () => {
  it("leaves half-typed medicines out so a draft save never fails mid-entry, and sends no identity fields", () => {
    const payload = toDraftPayload({ ...emptyForm(), diagnosis: " Fever ", medicines: [complete(), complete({ dose: "" })], followUpDate: "" });
    expect(payload.medicines).toHaveLength(1);
    expect(payload.diagnosis).toBe("Fever");
    expect(payload.followUpDate).toBeNull();
    expect(Object.keys(payload).sort()).toEqual(["additionalInstructions", "diagnosis", "followUpDate", "medicines", "recommendedTests", "warnings"]);
    expect(Object.keys(payload.medicines[0])).not.toEqual(expect.arrayContaining(["patientId", "doctorId", "status"]));
  });

  it("changes the signature when anything changes, ignoring row keys", () => {
    const a = { ...emptyForm(), diagnosis: "x", medicines: [complete()] };
    const b = { ...a, medicines: [{ ...a.medicines[0], key: "other" }] };
    expect(formSignature(a)).toBe(formSignature(b));
    expect(formSignature({ ...a, diagnosis: "y" })).not.toBe(formSignature(a));
  });
});

describe("catalog autocomplete", () => {
  it("prefills identity fields only; dose, route, frequency, duration and quantity stay empty", () => {
    const picked = applyCatalogProduct(emptyMedicine(), { id: "v1", name: "Crocin", genericName: "Paracetamol", strength: "500 mg", form: "Tablet", isDemo: true });
    expect(picked).toMatchObject({ catalogMedicineId: "v1", name: "Crocin", strength: "500 mg", dosageForm: "tablet", catalogIsSample: true });
    expect(picked.dose).toBe("");
    expect(picked.route).toBe("");
    expect(picked.frequency).toBe("");
    expect(picked.durationValue).toBe("");
    expect(picked.quantity).toBe("");
  });

  it("maps catalog forms conservatively", () => {
    expect(dosageFormFromCatalog("Syrup 100ml")).toBe("syrup");
    expect(dosageFormFromCatalog("Tablets")).toBe("tablet");
    expect(dosageFormFromCatalog("Wafer")).toBe("");
  });
});

describe("dosage wording", () => {
  it("states dose, route, frequency, duration, timing and food relation", () => {
    expect(
      describeDosage({ dose: "1 tablet", route: "oral", frequency: "Three times daily", durationValue: 5, durationUnit: "days", timing: ["morning", "night"], foodRelation: "after_food" }),
    ).toBe("1 tablet, Oral route, three times daily, for 5 days, morning and night, after food");
  });

  it("uses the singular for a duration of one and omits food when not applicable", () => {
    const text = describeDosage({ dose: "5 ml", route: "oral", frequency: "Once daily", durationValue: 1, durationUnit: "weeks", timing: [], foodRelation: "not_applicable" });
    expect(text).toBe("5 ml, Oral route, once daily, for 1 week");
  });
});
