import React, { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardTypeOptions, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, Paperclip, X } from "lucide-react-native";
import { toDoctorApiError } from "../api/client";
import { ActionButton, Card } from "./ui";
import { FIELD_SPECS, FieldErrors, formatBytes, validateFields, validatePickedFile } from "../application/validation";
import { ApplicationFiles, applicationApi } from "../services/applicationApi";
import { ApplicationFields, ConsultationMode, DoctorApplication, PickedFile } from "../types/application";
import { colors, round, space, type } from "../theme/tokens";

const EMPTY: ApplicationFields = {
  fullName: "", email: "", registrationNumber: "", registrationCouncil: "", qualification: "", medicalCollege: "",
  specialization: "", clinicName: "", clinicAddress: "", city: "", consultationMode: "BOTH",
};

const KEYBOARD: Partial<Record<keyof ApplicationFields, KeyboardTypeOptions>> = { email: "email-address" };
const AUTOCAP: Partial<Record<keyof ApplicationFields, "none" | "words" | "characters">> = {
  email: "none", registrationNumber: "characters", fullName: "words", city: "words",
};
const SECTIONS: Array<{ title: string; hint?: string; keys: Array<keyof ApplicationFields> }> = [
  { title: "Personal and contact", keys: ["fullName", "email"] },
  { title: "Professional registration", keys: ["registrationNumber", "registrationCouncil", "qualification", "medicalCollege", "specialization"] },
  { title: "Practice details", keys: ["clinicName", "clinicAddress", "city"] },
];
const MODES: Array<{ value: ConsultationMode; label: string }> = [
  { value: "ONLINE", label: "Online" },
  { value: "OFFLINE", label: "In person" },
  { value: "BOTH", label: "Both" },
];

interface Props {
  mode: "submit" | "resubmit";
  /** The current application when resubmitting (fields are prefilled; documents are optional replacements). */
  existing?: DoctorApplication | null;
  phone: string;
  onDone(application: DoctorApplication): void;
}

export function ApplicationForm({ mode, existing, phone, onDone }: Props) {
  const initial = useMemo<ApplicationFields>(
    () => (existing ? ({ ...EMPTY, ...pick(existing) }) : EMPTY),
    [existing],
  );
  const [values, setValues] = useState<ApplicationFields>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<ApplicationFiles>({});
  const [fileErrors, setFileErrors] = useState<{ graduation?: string; registration?: string }>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const resubmit = mode === "resubmit";

  const set = (key: keyof ApplicationFields, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const choose = async (slot: "graduationCertificate" | "registrationCertificate") => {
    const errKey = slot === "graduationCertificate" ? "graduation" : "registration";
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const picked: PickedFile = {
        uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "", size: asset.size ?? 0,
      };
      const problem = validatePickedFile(picked);
      setFileErrors((e) => ({ ...e, [errKey]: problem ?? undefined }));
      setFiles((f) => ({ ...f, [slot]: problem ? undefined : picked }));
    } catch {
      setFileErrors((e) => ({ ...e, [errKey]: "Could not open that file. Try another one." }));
    }
  };
  const clear = (slot: "graduationCertificate" | "registrationCertificate") =>
    setFiles((f) => ({ ...f, [slot]: undefined }));

  const submit = async () => {
    setFormError(null);
    const changedKeys = (Object.keys(values) as Array<keyof ApplicationFields>).filter((k) => values[k].trim() !== initial[k].trim());
    const fieldErrors = validateFields(values);
    const nextFileErrors: { graduation?: string; registration?: string } = {};
    if (!resubmit && !files.graduationCertificate) nextFileErrors.graduation = "Upload your graduation certificate.";
    if (!resubmit && !files.registrationCertificate) nextFileErrors.registration = "Upload your medical registration certificate.";
    setErrors(fieldErrors);
    setFileErrors((e) => ({ ...e, ...nextFileErrors }));
    if (Object.keys(fieldErrors).length > 0 || Object.keys(nextFileErrors).length > 0 || fileErrors.graduation || fileErrors.registration) {
      setFormError("Please fix the highlighted items.");
      return;
    }
    if (resubmit && changedKeys.length === 0 && !files.graduationCertificate && !files.registrationCertificate) {
      setFormError("Change a detail or attach a replacement document before resubmitting.");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const application = resubmit
        ? await applicationApi.resubmit(Object.fromEntries(changedKeys.map((k) => [k, values[k]])), files, setProgress)
        : await applicationApi.submit(values, files, setProgress);
      onDone(application);
    } catch (error) {
      const apiError = toDoctorApiError(error);
      if (apiError.details) {
        const mapped: FieldErrors = {};
        for (const [field, messages] of Object.entries(apiError.details)) {
          if (field in values) mapped[field as keyof ApplicationFields] = messages[0];
        }
        setErrors((e) => ({ ...e, ...mapped }));
      }
      setFormError(friendlyError(apiError.code, apiError.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={type.title}>{resubmit ? "Update your application" : "Register as a doctor"}</Text>
      <Text style={styles.intro}>
        {resubmit
          ? "Correct the details or replace the documents the reviewer asked about, then resubmit."
          : "Tell us about your registration and practice. A reviewer checks every application by hand."}
      </Text>
      <Text style={styles.required}>Fields marked * are required.</Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Mobile number</Text>
        <Text style={styles.verified} accessibilityLabel={`Mobile number ${phone}, verified by one-time code`}>{phone} · verified by one-time code</Text>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.keys.map((key) => {
            const spec = FIELD_SPECS.find((s) => s.key === key)!;
            const multiline = key === "clinicAddress";
            return (
              <View key={key} style={styles.fieldWrap}>
                <Text style={styles.label}>{spec.label} <Text style={styles.star}>*</Text></Text>
                <TextInput
                  style={[styles.input, multiline && styles.multiline, errors[key] ? styles.inputError : null]}
                  value={values[key]}
                  onChangeText={(t) => set(key, t)}
                  maxLength={spec.max}
                  multiline={multiline}
                  keyboardType={KEYBOARD[key]}
                  autoCapitalize={AUTOCAP[key] ?? "sentences"}
                  autoCorrect={false}
                  editable={!busy}
                  accessibilityLabel={`${spec.label}, required`}
                  accessibilityHint={errors[key]}
                />
                {key === "email" ? <Text style={styles.helper}>Used for contact only. We do not verify email addresses.</Text> : null}
                {errors[key] ? <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text> : null}
              </View>
            );
          })}
          {section.title === "Practice details" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Consultation mode <Text style={styles.star}>*</Text></Text>
              <View style={styles.modes} accessibilityRole="radiogroup">
                {MODES.map((m) => {
                  const selected = values.consultationMode === m.value;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => set("consultationMode", m.value)}
                      disabled={busy}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={m.label}
                      style={[styles.mode, selected && styles.modeSelected]}
                    >
                      <Text style={[styles.modeText, selected && styles.modeTextSelected]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>
      ))}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Documents</Text>
        <Text style={styles.helper}>PDF, JPEG or PNG, up to 5 MB each. Only the review team can open them. Uploading a document does not by itself prove it is genuine.</Text>
        <DocumentField
          label="Graduation certificate"
          required={!resubmit}
          current={existing?.documents.find((d) => d.kind === "GRADUATION_CERTIFICATE")?.fileName}
          file={files.graduationCertificate}
          error={fileErrors.graduation}
          disabled={busy}
          onChoose={() => void choose("graduationCertificate")}
          onClear={() => clear("graduationCertificate")}
        />
        <DocumentField
          label="Medical registration certificate"
          required={!resubmit}
          current={existing?.documents.find((d) => d.kind === "REGISTRATION_CERTIFICATE")?.fileName}
          file={files.registrationCertificate}
          error={fileErrors.registration}
          disabled={busy}
          onChoose={() => void choose("registrationCertificate")}
          onClear={() => clear("registrationCertificate")}
        />
      </Card>

      {busy ? (
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={styles.progressWrap}>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(4, Math.round(progress * 100))}%` }]} /></View>
          <Text style={styles.helper}>{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Processing…"}</Text>
        </View>
      ) : null}
      {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
      <ActionButton label={busy ? "Submitting…" : resubmit ? "Resubmit application" : "Submit application"} onPress={() => void submit()} disabled={busy} />
      {busy ? <ActivityIndicator color={colors.forest} /> : null}
    </View>
  );
}

function DocumentField(props: {
  label: string; required: boolean; current?: string; file?: PickedFile; error?: string; disabled: boolean;
  onChoose(): void; onClear(): void;
}) {
  const { label, required, current, file, error, disabled, onChoose, onClear } = props;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label} {required ? <Text style={styles.star}>*</Text> : null}</Text>
      {file ? (
        <View style={styles.fileRow}>
          <FileText size={18} color={colors.forest} />
          <Text style={styles.fileName} numberOfLines={1}>{file.name} · {formatBytes(file.size)}</Text>
          <Pressable onPress={onClear} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={10}>
            <X size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : current ? <Text style={styles.helper}>Currently on file: {current}. Choose a file only to replace it.</Text> : null}
      <Pressable
        onPress={onChoose}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${file ? "Replace" : "Choose"} ${label}${required ? ", required" : ""}`}
        style={({ pressed }) => [styles.pick, pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }]}
      >
        <Paperclip size={16} color={colors.forest} />
        <Text style={styles.pickText}>{file ? "Replace file" : "Choose file"}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function pick(a: DoctorApplication): ApplicationFields {
  return {
    fullName: a.fullName, email: a.email, registrationNumber: a.registrationNumber, registrationCouncil: a.registrationCouncil,
    qualification: a.qualification, medicalCollege: a.medicalCollege, specialization: a.specialization, clinicName: a.clinicName,
    clinicAddress: a.clinicAddress, city: a.city, consultationMode: a.consultationMode,
  };
}

export function friendlyError(code: string | undefined, message: string): string {
  switch (code) {
    case "APPLICATION_EXISTS": return "You already have an application. Refresh to see its status.";
    case "REGISTRATION_ALREADY_USED": return "This registration number is already linked to another application or doctor. Contact support if this is a mistake.";
    case "DOCUMENT_TOO_LARGE": return "One of the files is larger than 5 MB.";
    case "UNSUPPORTED_DOCUMENT_TYPE": return "Documents must be PDF, JPEG or PNG files.";
    case "DOCUMENT_STORAGE_UNAVAILABLE": return "Document upload is temporarily unavailable. Please try again later.";
    default: return message;
  }
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  intro: { ...type.body, color: colors.muted },
  required: { ...type.caption },
  section: { gap: space.md },
  sectionTitle: { ...type.heading },
  verified: { ...type.body, color: colors.forest, fontWeight: "600" },
  fieldWrap: { gap: 6 },
  label: { ...type.label },
  star: { color: colors.danger },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: round.md, paddingHorizontal: space.md, color: colors.text, fontSize: 16, backgroundColor: colors.background },
  multiline: { minHeight: 84, textAlignVertical: "top", paddingTop: space.sm },
  inputError: { borderColor: colors.danger },
  helper: { ...type.caption },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger },
  formError: { fontSize: 14, lineHeight: 20, color: colors.danger, textAlign: "center" },
  modes: { flexDirection: "row", gap: space.xs },
  mode: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: round.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  modeSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  modeText: { ...type.label },
  modeTextSelected: { color: colors.card },
  fileRow: { flexDirection: "row", alignItems: "center", gap: space.xs, padding: space.sm, borderRadius: round.md, backgroundColor: colors.sageLight },
  fileName: { ...type.body, flex: 1 },
  pick: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: round.md, borderWidth: 1, borderColor: colors.forest, borderStyle: "dashed" },
  pickText: { ...type.label, color: colors.forest },
  progressWrap: { gap: 6 },
  progressTrack: { height: 8, borderRadius: round.pill, backgroundColor: colors.sageLight, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: colors.forest },
});
