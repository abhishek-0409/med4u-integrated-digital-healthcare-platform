import { makeClinicalPrescription } from "../test/clinicalPrescriptionFixtures";
import { prescriptionPdfHtml } from "./prescriptionPdf";

describe("prescriptionPdfHtml", () => {
  it("renders only verified registration details and the complete medication directions", () => {
    const rx = makeClinicalPrescription();
    const html = prescriptionPdfHtml({ ...rx, doctor: { ...rx.doctor, registrationNumber: "REG-45", registrationCouncil: "State Council", registrationVerified: true } });
    expect(html).toContain("REG-45");
    expect(html).toContain("Three times daily");
    expect(html).toContain("500 mg");
    expect(html).toContain("break-inside:avoid");
    expect(html).toContain("@page");
  });

  it("escapes patient and clinical text before passing it to the native PDF renderer", () => {
    const html = prescriptionPdfHtml(makeClinicalPrescription({ diagnosis: "<script>alert(1)</script>" }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("includes the catalog test and its preparation instructions", () => {
    const rx = makeClinicalPrescription({ recommendedTests: [{ labTestId: "test-1", name: "CBC", preparationInstructions: "Fast for 8 hours", clinicalInstructions: "Before follow-up" }] });
    const html = prescriptionPdfHtml(rx);
    expect(html).toContain("Recommended tests");
    expect(html).toContain("CBC");
    expect(html).toContain("Fast for 8 hours");
  });

  it("does not invent an unverified registration, signature, or missing diagnosis", () => {
    const html = prescriptionPdfHtml(makeClinicalPrescription({ diagnosis: null }));
    expect(html).not.toContain("Registration:");
    expect(html).toContain("Not provided");
    expect(html).toContain("no digital signature");
  });
});
