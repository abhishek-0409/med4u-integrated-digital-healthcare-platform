import { ApplicationFields } from "../types/application";
import { MAX_DOCUMENT_BYTES, validateFields, validatePickedFile } from "./validation";

const valid: ApplicationFields = {
  fullName: "Dr Asha Verma",
  email: "asha@example.com",
  registrationNumber: "MH/2015/12345",
  registrationCouncil: "Maharashtra Medical Council",
  qualification: "MBBS, MD",
  medicalCollege: "Grant Medical College",
  specialization: "Cardiology",
  clinicName: "Verma Heart Clinic",
  clinicAddress: "12 Lake View Road, Kothrud",
  city: "Pune",
  consultationMode: "BOTH",
};

describe("validateFields", () => {
  it("accepts a complete application", () => {
    expect(validateFields(valid)).toEqual({});
  });

  it.each(Object.keys(valid) as Array<keyof ApplicationFields>)("requires %s", (key) => {
    const errors = validateFields({ ...valid, [key]: "" });
    expect(errors[key]).toBeTruthy();
  });

  it("rejects an invalid email and unsafe registration number characters", () => {
    expect(validateFields({ ...valid, email: "not-an-email" }).email).toMatch(/valid email/);
    expect(validateFields({ ...valid, registrationNumber: "12345'; DROP" }).registrationNumber).toMatch(/letters, digits/);
  });

  it("can validate a subset (resubmission corrects only some fields)", () => {
    expect(validateFields({ city: "" }, ["city"]).city).toBeTruthy();
    expect(validateFields({ city: "" }, ["fullName"]).city).toBeUndefined();
    expect(validateFields({ city: "Pune" }, ["city"])).toEqual({});
  });
});

describe("validatePickedFile", () => {
  const ok = { name: "degree.pdf", size: 1000, mimeType: "application/pdf" };
  it("accepts PDF, JPEG and PNG", () => {
    expect(validatePickedFile(ok)).toBeNull();
    expect(validatePickedFile({ name: "a.jpeg", size: 10, mimeType: "image/jpeg" })).toBeNull();
    expect(validatePickedFile({ name: "a.PNG", size: 10, mimeType: "image/png" })).toBeNull();
  });
  it("rejects oversize, empty, unsupported, executable and mismatched files", () => {
    expect(validatePickedFile({ ...ok, size: MAX_DOCUMENT_BYTES + 1 })).toMatch(/5 MB/);
    expect(validatePickedFile({ ...ok, size: 0 })).toMatch(/empty/);
    expect(validatePickedFile({ name: "a.txt", size: 10, mimeType: "text/plain" })).toMatch(/PDF, JPEG or PNG/);
    expect(validatePickedFile({ name: "run.exe.pdf", size: 10, mimeType: "application/pdf" })).toMatch(/not allowed/);
    expect(validatePickedFile({ name: "a.png", size: 10, mimeType: "application/pdf" })).toMatch(/does not match/);
  });
});
