import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, round, space, type } from "../theme/tokens";
import { describeDosage, FOOD_LABEL, medicineTitle } from "../prescription/prescriptionModel";
import { DoctorSnapshot, PrescribedMedicine, PrescribedTest, PrescriptionStatus } from "../types/prescription";

export interface DocumentModel {
  reference: string | null;
  status: PrescriptionStatus | "preview";
  doctor: DoctorSnapshot;
  patientName: string;
  consultationDate: string;
  issuedAt: string | null;
  diagnosis: string;
  medicines: PrescribedMedicine[];
  recommendedTests?: PrescribedTest[];
  additionalInstructions: string | null;
  warnings: string | null;
  followUpDate: string | null;
  amendmentReason?: string | null;
  cancellationReason?: string | null;
}

const STATUS_LABEL: Record<DocumentModel["status"], string> = {
  preview: "Not yet issued",
  draft: "Draft",
  issued: "Issued",
  superseded: "Superseded by a corrected prescription",
  cancelled: "Cancelled",
};

export const formatDate = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : "Asia/Kolkata" });
};

/** Readable medical-document layout. Only facts supplied by the server appear: nothing is invented here. */
export function PrescriptionDocument({ doc }: { doc: DocumentModel }) {
  const { doctor } = doc;
  return (
    <View style={styles.sheet} accessibilityLabel={`Prescription ${doc.reference ?? "preview"}`}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Med4U</Text>
        <View style={styles.statusPill}><Text style={styles.statusText}>{STATUS_LABEL[doc.status]}</Text></View>
      </View>
      {doctor.isDemo ? <Text style={styles.demo}>DEMO · SYNTHETIC PRESCRIPTION · NOT FOR DISPENSING</Text> : null}
      {doc.status === "cancelled" ? <Text style={styles.cancelled}>This prescription was cancelled{doc.cancellationReason ? `: ${doc.cancellationReason}` : "."}</Text> : null}
      {doc.status === "superseded" ? <Text style={styles.cancelled}>A corrected prescription replaces this one. Do not use this version.</Text> : null}

      <View style={styles.block}>
        <Text style={styles.doctorName}>{doctor.name}</Text>
        <Text style={styles.meta}>{doctor.specialization}{doctor.clinicName ? ` · ${doctor.clinicName}` : ""}</Text>
        {doctor.registrationVerified && doctor.registrationNumber ? (
          <Text style={styles.meta}>Registration: {doctor.registrationNumber}{doctor.registrationCouncil ? ` (${doctor.registrationCouncil})` : ""}</Text>
        ) : (
          <Text style={styles.meta}>Registration details not available</Text>
        )}
      </View>

      <View style={styles.grid}>
        <Info label="Patient" value={doc.patientName} />
        <Info label="Consultation" value={formatDate(doc.consultationDate)} />
        <Info label="Issued" value={doc.issuedAt ? formatDate(doc.issuedAt) : "—"} />
        <Info label="Reference" value={doc.reference ?? "Assigned on issue"} />
      </View>

      <Section title="Diagnosis / assessment"><Text style={styles.body}>{doc.diagnosis || "—"}</Text></Section>

      <Section title="Medicines">
        {doc.medicines.length === 0 ? <Text style={styles.body}>None added.</Text> : doc.medicines.map((m, index) => (
          <View key={`${m.name}-${index}`} style={styles.medicine} accessibilityLabel={`${medicineTitle(m)}. ${describeDosage(m)}`}>
            <Text style={styles.medicineName}>{index + 1}. {medicineTitle(m)}</Text>
            {m.genericName ? <Text style={styles.meta}>Generic: {m.genericName}</Text> : null}
            <Text style={styles.body}>{describeDosage(m)}</Text>
            <Text style={styles.meta}>Quantity: {m.quantity}{m.quantityUnit ? ` ${m.quantityUnit}` : ""} · Food: {FOOD_LABEL[m.foodRelation]}</Text>
            {m.instructions ? <Text style={styles.body}>Note: {m.instructions}</Text> : null}
          </View>
        ))}
      </Section>

      {(doc.recommendedTests?.length ?? 0) > 0 ? (
        <Section title="Recommended lab tests">
          {doc.recommendedTests!.map((test) => (
            <View key={test.labTestId} style={styles.medicine}>
              <Text style={styles.medicineName}>{test.name}</Text>
              {test.preparationInstructions ? <Text style={styles.body}>Preparation: {test.preparationInstructions}</Text> : null}
              {test.clinicalInstructions ? <Text style={styles.body}>Doctor's instructions: {test.clinicalInstructions}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {doc.additionalInstructions ? <Section title="Additional instructions"><Text style={styles.body}>{doc.additionalInstructions}</Text></Section> : null}
      {doc.warnings ? <Section title="Warnings & patient-specific instructions"><Text style={[styles.body, { color: colors.warning }]}>{doc.warnings}</Text></Section> : null}
      {doc.followUpDate ? <Section title="Follow-up"><Text style={styles.body}>Review on {formatDate(doc.followUpDate)}</Text></Section> : null}
      {doc.amendmentReason ? <Section title="Reason for correction"><Text style={styles.body}>{doc.amendmentReason}</Text></Section> : null}

      <Text style={styles.footer}>Issued electronically through Med4U. This document is not digitally signed.</Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.caption}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.block}><Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  sheet: { gap: space.md, padding: space.md, borderRadius: round.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 24, fontWeight: "800", color: colors.green, letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: round.pill, backgroundColor: colors.sageLight, maxWidth: "70%" },
  statusText: { fontSize: 12, fontWeight: "700", color: colors.forest },
  demo: { fontSize: 12, fontWeight: "800", color: colors.warning },
  cancelled: { fontSize: 14, fontWeight: "700", color: colors.danger },
  block: { gap: 4 },
  doctorName: { ...type.heading, color: colors.forest },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  info: { minWidth: "45%", flexGrow: 1, gap: 2 },
  caption: { ...type.caption },
  infoValue: { ...type.label },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.green, textTransform: "uppercase", letterSpacing: 0.6 },
  body: { ...type.body },
  meta: { ...type.caption },
  medicine: { gap: 3, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  medicineName: { ...type.label, color: colors.forest },
  footer: { ...type.caption, fontStyle: "italic" },
});
