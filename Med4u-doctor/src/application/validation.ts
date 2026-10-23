import { ApplicationFields, PickedFile } from "../types/application";

/** Client-side mirror of the server rules, so people see problems before uploading. The server stays authoritative. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
const ALLOWED_EXT: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};
const DANGEROUS_EXT = new Set(["exe", "dll", "bat", "cmd", "com", "msi", "scr", "ps1", "sh", "js", "jar", "apk", "vbs", "html", "htm", "svg", "php", "py"]);

export type FieldErrors = Partial<Record<keyof ApplicationFields, string>>;

export interface FieldSpec {
  key: keyof ApplicationFields;
  label: string;
  min: number;
  max: number;
}

export const FIELD_SPECS: FieldSpec[] = [
  { key: "fullName", label: "Full name", min: 3, max: 100 },
  { key: "email", label: "Email address", min: 5, max: 150 },
  { key: "registrationNumber", label: "Medical registration number", min: 3, max: 50 },
  { key: "registrationCouncil", label: "Registration council / state medical council", min: 3, max: 120 },
  { key: "qualification", label: "Medical qualification", min: 2, max: 100 },
  { key: "medicalCollege", label: "Medical college", min: 3, max: 150 },
  { key: "specialization", label: "Specialization", min: 2, max: 100 },
  { key: "clinicName", label: "Clinic or hospital name", min: 2, max: 150 },
  { key: "clinicAddress", label: "Clinic or hospital address", min: 5, max: 300 },
  { key: "city", label: "City", min: 2, max: 100 },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGISTRATION = /^[A-Za-z0-9][A-Za-z0-9 /._-]{2,49}$/;

export function validateFields(values: Partial<ApplicationFields>, only?: Array<keyof ApplicationFields>): FieldErrors {
  const errors: FieldErrors = {};
  for (const spec of FIELD_SPECS) {
    if (only && !only.includes(spec.key)) continue;
    const value = (values[spec.key] ?? "").toString().trim();
    if (!value) errors[spec.key] = `${spec.label} is required.`;
    else if (value.length < spec.min) errors[spec.key] = `${spec.label} must be at least ${spec.min} characters.`;
    else if (value.length > spec.max) errors[spec.key] = `${spec.label} must be at most ${spec.max} characters.`;
  }
  const email = (values.email ?? "").trim();
  if (!errors.email && (!only || only.includes("email")) && !EMAIL.test(email)) errors.email = "Enter a valid email address.";
  const reg = (values.registrationNumber ?? "").trim();
  if (!errors.registrationNumber && (!only || only.includes("registrationNumber")) && !REGISTRATION.test(reg)) {
    errors.registrationNumber = "Use letters, digits and / . _ - only.";
  }
  if (!only || only.includes("consultationMode")) {
    if (!values.consultationMode) errors.consultationMode = "Choose how you consult.";
  }
  return errors;
}

/** Returns a user-facing problem with a chosen file, or null when it is acceptable. */
export function validatePickedFile(file: Pick<PickedFile, "name" | "size" | "mimeType">): string | null {
  if (!file.size || file.size <= 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is larger than 5 MB.";
  const mime = (file.mimeType ?? "").toLowerCase();
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) return "Choose a PDF, JPEG or PNG file.";
  const parts = file.name.toLowerCase().split(".").slice(1);
  if (parts.some((p) => DANGEROUS_EXT.has(p))) return "That file name is not allowed.";
  const ext = parts[parts.length - 1] ?? "";
  if (!ALLOWED_EXT[mime].includes(ext)) return "The file extension does not match the file type.";
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
