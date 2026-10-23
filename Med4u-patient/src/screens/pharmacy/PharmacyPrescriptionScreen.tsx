import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrescriptionViewer } from "../../components/pharmacy/PrescriptionViewer";
import { Button } from "../../components/ui/Button";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Input } from "../../components/ui/Input";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAsyncData } from "../../hooks/useAsyncData";
import { toApiError } from "../../services/api/errors";
import { pharmacyService } from "../../services/pharmacy.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { PrescriptionRejectionReason } from "../../types/order";
import { formatDateTime, PRESCRIPTION_STATUS, orderReference } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "PharmacyPrescription">;

const REASONS: Array<{ value: PrescriptionRejectionReason; label: string }> = [
  { value: "ILLEGIBLE", label: "Illegible" },
  { value: "EXPIRED", label: "Expired" },
  { value: "INCOMPLETE", label: "Incomplete" },
  { value: "MEDICINE_NOT_COVERED", label: "Doesn't cover medicines" },
  { value: "NOT_A_PRESCRIPTION", label: "Not a prescription" },
  { value: "OTHER", label: "Other" },
];

export function PharmacyPrescriptionScreen({ navigation, route }: Props) {
  const { prescriptionId } = route.params;
  const { data, loading, error, reload } = useAsyncData(() => pharmacyService.prescription(prescriptionId), [prescriptionId]);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<PrescriptionRejectionReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (loading && !data) return <Loader />;
  if (!data) return <ErrorState message={error ?? "Prescription not found."} onRetry={reload} />;

  const pending = data.status === "PENDING";
  const status = PRESCRIPTION_STATUS[data.status];

  const act = async (run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await run();
      navigation.goBack();
    } catch (err) {
      setFailure(toApiError(err).message);
      reload();
    } finally {
      setBusy(false);
      setApproving(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.title}>{data.patientName}</Text>
              <Text style={styles.caption}>Submitted {formatDateTime(data.submittedAt)}</Text>
            </View>
            <StatusBadge label={status.label} tone={status.tone} />
          </View>
          {data.reviewedAt ? <Text style={styles.caption}>Reviewed {formatDateTime(data.reviewedAt)}</Text> : null}
          {data.rejectionReason ? (
            <Text style={styles.body}>
              Rejected: {REASONS.find((r) => r.value === data.rejectionReason)?.label}
              {data.reviewerNote ? ` — ${data.reviewerNote}` : ""}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Prescription</Text>
          <PrescriptionViewer prescriptionId={prescriptionId} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Medicines to check{data.order ? ` · order ${orderReference(data.order.id)}` : ""}
          </Text>
          {data.order ? (
            data.order.items.map((i) => (
              <View key={`${i.name}-${i.strength}`} accessible>
                <Text style={styles.itemName}>
                  {i.name} × {i.quantity}
                </Text>
                <Text style={styles.caption}>
                  {[i.genericName, i.strength, i.form].filter(Boolean).join(" · ")}
                  {i.requiresPrescription ? "" : " · no prescription needed"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.body}>No order is attached to this prescription.</Text>
          )}
          <Text style={styles.caption}>
            Approving records that you reviewed this document for these medicines. It does not verify that it is authentic.
          </Text>
        </View>

        {failure ? (
          <View accessibilityLiveRegion="assertive">
            <InfoBanner tone="warning" title="Couldn't complete that" message={failure} />
          </View>
        ) : null}

        {pending && data.order ? (
          rejecting ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Reason for rejecting</Text>
              <View style={styles.chips}>
                {REASONS.map((r) => (
                  <CategoryChip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
                ))}
              </View>
              <Input
                label="Note to patient (optional)"
                value={note}
                onChangeText={setNote}
                maxLength={200}
                hint="Shown to the patient. Don't include personal or medical details."
              />
              <Button
                title="Reject and cancel order"
                variant="danger"
                disabled={!reason}
                loading={busy}
                onPress={() => reason && act(() => pharmacyService.reject(prescriptionId, reason, note.trim() || undefined))}
              />
              <Button title="Back" variant="ghost" onPress={() => setRejecting(false)} disabled={busy} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button title="Approve prescription" onPress={() => setApproving(true)} disabled={busy} />
              <Button title="Reject…" variant="secondary" onPress={() => setRejecting(true)} disabled={busy} />
            </View>
          )
        ) : null}
        {pending && !data.order ? (
          <InfoBanner message="No active order is waiting on this prescription, so there is nothing to review." />
        ) : null}
      </ScrollView>

      <ConfirmationDialog
        visible={approving}
        title="Approve this prescription?"
        message="The order will be confirmed and released for processing. Your name and the time are recorded."
        confirmLabel="Approve"
        loading={busy}
        onConfirm={() => act(() => pharmacyService.approve(prescriptionId))}
        onCancel={() => setApproving(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  actions: { gap: spacing.xs },
  title: { ...typography.h3 },
  sectionTitle: { ...typography.title },
  itemName: { ...typography.bodyBold },
  body: { ...typography.body },
  caption: { ...typography.caption, color: colors.textSubtle },
});
