import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { ClinicalPrescription } from "../../types/clinical-prescription";
import {
  describeDosage,
  FOOD_LABEL,
  formatPrescriptionDate,
  medicineTitle,
  STATUS_LABEL,
} from "../../utils/prescriptionFormat";

/**
 * Readable, printable prescription layout. It shows only what the server recorded: registration details appear
 * only when verified, and the footer states plainly that the document is not digitally signed.
 */
export function PrescriptionSheet({ rx }: { rx: ClinicalPrescription }) {
  const { doctor } = rx;
  return (
    <View style={styles.sheet} accessibilityLabel={`Prescription ${rx.reference}`}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Med4U</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{STATUS_LABEL[rx.status]}</Text>
        </View>
      </View>

      {doctor.isDemo ? <Text style={styles.demo}>DEMO · SYNTHETIC PRESCRIPTION · NOT FOR DISPENSING</Text> : null}
      {rx.status === "cancelled" ? (
        <Text style={styles.alert} accessibilityRole="alert">
          Your doctor cancelled this prescription{rx.cancellationReason ? `: ${rx.cancellationReason}` : "."} Do not take medicine from it.
        </Text>
      ) : null}
      {rx.status === "superseded" ? (
        <Text style={styles.alert} accessibilityRole="alert">
          A corrected prescription replaces this one. Use the newer version.
        </Text>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.doctorName}>{doctor.name}</Text>
        <Text style={styles.meta}>
          {doctor.specialization}
          {doctor.clinicName ? ` · ${doctor.clinicName}` : ""}
        </Text>
        {doctor.registrationVerified && doctor.registrationNumber ? (
          <Text style={styles.meta}>
            Registration: {doctor.registrationNumber}
            {doctor.registrationCouncil ? ` (${doctor.registrationCouncil})` : ""}
          </Text>
        ) : (
          <Text style={styles.meta}>Registration details not available</Text>
        )}
      </View>

      <View style={styles.grid}>
        <Info label="Patient" value={rx.patient.name} />
        <Info label="Consultation date" value={formatPrescriptionDate(rx.consultation.date)} />
        <Info label="Issue date" value={formatPrescriptionDate(rx.issuedAt)} />
        <Info label="Prescription ID" value={rx.reference} />
      </View>

      <Section title="Diagnosis / assessment">
        <Text style={styles.body}>{rx.diagnosis || "—"}</Text>
      </Section>

      <Section title="Recommended tests">
        {rx.recommendedTests?.length ? rx.recommendedTests.map((test, index) => (
          <View key={`${test.labTestId}-${index}`} style={styles.medicine}>
            <Text style={styles.medicineName}>{index + 1}. {test.name}</Text>
            {test.preparationInstructions ? <Text style={styles.meta}>Preparation: {test.preparationInstructions}</Text> : null}
            {test.clinicalInstructions ? <Text style={styles.body}>Doctor's note: {test.clinicalInstructions}</Text> : null}
          </View>
        )) : <Text style={styles.meta}>No tests recommended.</Text>}
      </Section>

      <Section title="Medicines">
        {rx.medicines.map((m, index) => (
          <View key={`${m.name}-${index}`} style={styles.medicine} accessible accessibilityLabel={`${medicineTitle(m)}. ${describeDosage(m)}`}>
            <Text style={styles.medicineName}>
              {index + 1}. {medicineTitle(m)}
            </Text>
            {m.genericName ? <Text style={styles.meta}>Generic: {m.genericName}</Text> : null}
            <Text style={styles.body}>{describeDosage(m)}</Text>
            <Text style={styles.meta}>
              Quantity: {m.quantity}
              {m.quantityUnit ? ` ${m.quantityUnit}` : ""} · Food: {FOOD_LABEL[m.foodRelation]}
            </Text>
            {m.instructions ? <Text style={styles.body}>Note: {m.instructions}</Text> : null}
          </View>
        ))}
      </Section>

      {rx.additionalInstructions ? (
        <Section title="Additional instructions">
          <Text style={styles.body}>{rx.additionalInstructions}</Text>
        </Section>
      ) : null}
      {rx.warnings ? (
        <Section title="Warnings">
          <Text style={[styles.body, { color: colors.warning }]}>{rx.warnings}</Text>
        </Section>
      ) : null}
      {rx.followUpDate ? (
        <Section title="Follow-up">
          <Text style={styles.body}>Please review with your doctor on {formatPrescriptionDate(rx.followUpDate)}.</Text>
        </Section>
      ) : null}
      {rx.amendmentReason ? (
        <Section title="Reason for correction">
          <Text style={styles.body}>{rx.amendmentReason}</Text>
        </Section>
      ) : null}

      <Text style={styles.footer}>Issued electronically through Med4U. This document is not digitally signed.</Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  brand: { ...typography.h2, color: colors.primary, fontWeight: "800" },
  statusPill: { flexShrink: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.mint },
  statusText: { ...typography.caption, fontWeight: "700", color: colors.primaryDark },
  demo: { ...typography.caption, fontWeight: "800", color: colors.warning },
  alert: { ...typography.bodyBold, color: colors.danger },
  block: { gap: 4 },
  doctorName: { ...typography.title, color: colors.primaryDark },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  info: { minWidth: "45%", flexGrow: 1, gap: 2 },
  caption: { ...typography.caption, color: colors.textMuted },
  infoValue: { ...typography.bodyBold, color: colors.text },
  sectionTitle: { ...typography.caption, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.6 },
  body: { ...typography.body, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  medicine: { gap: 3, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  medicineName: { ...typography.bodyBold, color: colors.primaryDark },
  footer: { ...typography.caption, color: colors.textMuted, fontStyle: "italic" },
});
