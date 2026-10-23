import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ClipboardList, FileText, Stethoscope } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrescriptionUploader } from "../../components/prescription/PrescriptionUploader";
import { PrescriptionViewer } from "../../components/pharmacy/PrescriptionViewer";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { toApiError } from "../../services/api/errors";
import { clinicalPrescriptionService } from "../../services/clinical-prescription.service";
import { healthRecordsService } from "../../services/health-records.service";
import { colors } from "../../theme/colors";
import { iconSizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PatientPrescription } from "../../types/health-records";
import { ClinicalPrescription } from "../../types/clinical-prescription";
import { MainStackParamList } from "../../types/navigation";
import { formatPrescriptionDate, STATUS_LABEL } from "../../utils/prescriptionFormat";

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};
const toneFor = (status: string) => {
  switch (status.toLowerCase()) {
    case "approved": return "success" as const;
    case "rejected": return "danger" as const;
    case "pending": return "warning" as const;
    case "issued": return "primary" as const;
    default: return "neutral" as const;
  }
};

/** Patient's issued prescriptions and their own pharmacy uploads. Uploads are never editable after submission. */
type Props = NativeStackScreenProps<MainStackParamList, "Prescription">;

export function PrescriptionScreen({ navigation }: Props) {
  const [doctorItems, setDoctorItems] = useState<ClinicalPrescription[]>([]);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [items, setItems] = useState<PatientPrescription[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    setDoctorError(null);
    // Independent requests: a failure in one list must not hide the other.
    const [records, issued] = await Promise.allSettled([healthRecordsService.prescriptions(), clinicalPrescriptionService.list({ limit: 50 })]);
    if (records.status === "fulfilled") setItems(records.value); else setError(toApiError(records.reason).message);
    if (issued.status === "fulfilled") setDoctorItems(issued.value.items); else setDoctorError(toApiError(issued.reason).message);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  // A prescription issued while the app is open appears as soon as this screen is shown again.
  useRefreshOnFocus(useCallback(() => { void load(true); }, [load]));

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
        <View style={styles.intro}>
          <View style={styles.icon}><ClipboardList size={iconSizes.lg} color={colors.primaryDark} /></View>
          <View style={styles.introText}>
            <Text style={styles.heading} accessibilityRole="header">Prescriptions</Text>
            <Text style={styles.subtitle}>View prescriptions and review updates linked to your account.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">From your doctors</Text>
        {loading ? <LoadingSkeleton count={2} /> : doctorError ? (
          <ErrorState title="Couldn't load doctor prescriptions" message={doctorError} onRetry={() => void load()} />
        ) : !doctorItems.length ? (
          <EmptyState icon={Stethoscope} title="No prescriptions from your doctors yet" message="After a consultation, a prescription your doctor issues will appear here. Pull down to refresh." />
        ) : doctorItems.map((rx) => (
          <Pressable key={rx.id} accessibilityRole="button" accessibilityLabel={`Open prescription ${rx.reference} from ${rx.doctor.name}`} onPress={() => navigation.navigate("PrescriptionDetail", { prescriptionId: rx.id })}>
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{rx.doctor.name}</Text>
                  <Text style={styles.meta}>{rx.doctor.specialization}</Text>
                </View>
                <StatusBadge label={rx.status === "superseded" ? "Replaced" : STATUS_LABEL[rx.status]} tone={rx.status === "issued" ? "primary" : rx.status === "cancelled" ? "danger" : "warning"} />
              </View>
              <Text style={styles.body}>{rx.diagnosis ?? "Prescription"}</Text>
              <Text style={styles.meta}>Consultation {formatPrescriptionDate(rx.consultation.date)} · Issued {formatPrescriptionDate(rx.issuedAt)}</Text>
              <Text style={styles.hint}>{rx.medicines.length} {rx.medicines.length === 1 ? "medicine" : "medicines"} · {rx.reference}</Text>
            </Card>
          </Pressable>
        ))}

        <Card style={styles.uploadCard}>
          <Text style={styles.sectionTitle}>Upload your prescription</Text>
          <Text style={styles.hint}>Upload a photo or PDF to attach to a prescription medicine order. A pharmacist reviews uploads with an order.</Text>
          <PrescriptionUploader onUploaded={() => void load(true)} />
        </Card>

        <Text style={styles.sectionTitle}>Prescription history</Text>
        {loading ? <LoadingSkeleton count={3} /> : error && !items.length ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !items.length ? (
          <EmptyState icon={FileText} title="No prescriptions yet" message="Prescriptions issued to you and your uploads will appear here." />
        ) : items.map((item) => {
          const isUpload = item.kind === "patient_upload";
          return (
            <Card key={`${item.kind}:${item.id}`} style={styles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{isUpload ? "Uploaded prescription" : "Doctor prescription"}</Text>
                  <Text style={styles.meta}>{formatDate(item.date)}</Text>
                </View>
                <StatusBadge label={item.status.replaceAll("_", " ")} tone={toneFor(item.status)} />
              </View>
              {item.clinician ? <Text style={styles.body}>Prescribed by {item.clinician}</Text> : null}
              {isUpload ? <Text style={styles.body}>Your upload is stored privately and can be viewed using your signed-in account.</Text> : null}
              {!isUpload ? <Text style={styles.hint}>Medicine and dosage details are not included in the available prescription record.</Text> : null}
              {item.fileAvailable ? (
                <>
                  <Button
                    title={openId === item.id ? "Close document" : "View document"}
                    size="sm"
                    fullWidth={false}
                    variant="secondary"
                    onPress={() => setOpenId((current) => current === item.id ? null : item.id)}
                  />
                  {openId === item.id ? <PrescriptionViewer prescriptionId={item.id} /> : null}
                </>
              ) : null}
            </Card>
          );
        })}
        {error && items.length > 0 ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  introText: { flex: 1, gap: spacing.xxs },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint },
  heading: { ...typography.h2, color: colors.primaryDark },
  subtitle: { ...typography.body, color: colors.textMuted },
  sectionTitle: { ...typography.title, color: colors.primaryDark },
  uploadCard: { gap: spacing.sm },
  card: { gap: spacing.sm },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  title: { ...typography.bodyBold, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted },
  meta: { ...typography.caption, color: colors.textSubtle },
  error: { ...typography.body, color: colors.danger },
});
