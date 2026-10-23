import {
  ageLabelFromDobInput,
  dobInputToIso,
  firstIncompleteStep,
  formatDobInput,
  isoToDobInput,
  validateBasicDetails,
  validateDobInput,
  validateHeight,
  validateWeight,
} from "./profileForm";

describe("date of birth input", () => {
  it("formats while typing and converts to ISO", () => {
    expect(formatDobInput("1804")).toBe("18/04");
    expect(formatDobInput("18041992")).toBe("18/04/1992");
    expect(formatDobInput("18/04/1992999")).toBe("18/04/1992");
    expect(dobInputToIso("18/04/1992")).toBe("1992-04-18");
    expect(dobInputToIso("18/04")).toBeNull();
    expect(isoToDobInput("1992-04-18")).toBe("18/04/1992");
    expect(isoToDobInput(null)).toBe("");
  });

  it("rejects impossible, future and implausibly old dates", () => {
    expect(validateDobInput("")).toMatch(/Select/);
    expect(validateDobInput("31/02/2000")).toMatch(/valid/);
    expect(validateDobInput("01/01/2999")).toMatch(/valid/);
    expect(validateDobInput("01/01/1850")).toMatch(/valid/);
    expect(validateDobInput("18/04/1992")).toBeNull();
  });

  it("derives age from the date instead of asking for it", () => {
    const year = new Date().getUTCFullYear() - 30;
    expect(ageLabelFromDobInput(`01/01/${year}`)).toMatch(/^(29|30) years$/);
    expect(ageLabelFromDobInput("garbage")).toBeNull();
  });
});

describe("basic details", () => {
  it("requires name, email and date of birth", () => {
    const errors = validateBasicDetails({ name: "", email: "", dob: "" });
    expect(Object.keys(errors).sort()).toEqual(["dob", "email", "name"]);
  });

  it("validates email format and name length", () => {
    expect(validateBasicDetails({ name: "A", email: "x", dob: "18/04/1992" })).toEqual({
      name: expect.any(String),
      email: expect.any(String),
    });
    expect(validateBasicDetails({ name: "Asha Rao", email: "asha@example.com", dob: "18/04/1992" })).toEqual({});
  });
});

describe("optional measurements", () => {
  it("accepts empty values and sensible numbers", () => {
    expect(validateHeight("")).toBeNull();
    expect(validateHeight("165.5")).toBeNull();
    expect(validateWeight("58")).toBeNull();
  });

  it("rejects out-of-range and non-numeric values", () => {
    expect(validateHeight("20")).toMatch(/between/);
    expect(validateHeight("400")).toMatch(/between/);
    expect(validateHeight("tall")).toMatch(/number/);
    expect(validateWeight("0")).toMatch(/between/);
    expect(validateWeight("700")).toMatch(/between/);
    expect(validateWeight("60.55")).toMatch(/decimal/);
  });
});

describe("resuming onboarding", () => {
  const base = { phone: "+919800000001", name: "+919800000001", email: null, dob: null, gender: null, bloodGroup: null };

  it("starts at the first step that lacks required data", () => {
    expect(firstIncompleteStep(base)).toBe("BasicDetails");
    expect(firstIncompleteStep({ ...base, name: "Asha Rao", email: "patient@example.invalid", dob: "1992-04-18" })).toBe("HealthInfo");
    expect(
      firstIncompleteStep({ ...base, name: "Asha Rao", email: "patient@example.invalid", dob: "1992-04-18", gender: "female", bloodGroup: "unknown" }),
    ).toBe("AccountReady");
  });
});
