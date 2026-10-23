import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { clinicalPrescriptionService } from "../../services/clinical-prescription.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency } from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "OrderFromPrescription">;
type Options = Awaited<ReturnType<typeof clinicalPrescriptionService.medicineOrderOptions>>;

export function OrderFromPrescriptionScreen({ navigation, route }: Props) {
  const [data, setData] = useState<Options | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, { variantId: string; quantity: number }>>({});
  const load = () => {
    setLoading(true); setError(null);
    clinicalPrescriptionService.medicineOrderOptions(route.params.prescriptionId)
      .then((value) => { setData(value); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Couldn't load medicine matches."); setLoading(false); });
  };
  useEffect(load, [route.params.prescriptionId]);
  const toggle = (key: string, variantId: string, max: number) => setSelected((prev) => {
    if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
    return { ...prev, [key]: { variantId, quantity: Math.max(1, Math.min(max || 1, 1)) } };
  });
  const changeQuantity = (key: string, delta: number, max: number) => setSelected((prev) => {
    const current = prev[key];
    if (!current) return prev;
    const quantity = Math.max(1, Math.min(max, current.quantity + delta));
    return { ...prev, [key]: { ...current, quantity } };
  });
  return <Screen padded={false}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>Order prescribed medicines</Text>
    <Text style={styles.body}>Matches use the issued prescription and current catalog. A pharmacist reviews prescription medicines before processing.</Text>
    {loading ? <LoadingSkeleton count={3} /> : error ? <ErrorState title="Couldn't match medicines" message={error} onRetry={load} /> : data?.medicines.map((line) => {
      const key = String(line.prescriptionMedicineIndex);
      return <Card key={key} style={styles.card}>
        <Text style={styles.name}>{line.prescriptionMedicine.name} {line.prescriptionMedicine.strength} · {line.prescriptionMedicine.dosageForm}</Text>
        <Text style={styles.meta}>Prescribed quantity: {line.prescriptionMedicine.quantity}{line.prescriptionMedicine.quantityUnit ? ` ${line.prescriptionMedicine.quantityUnit}` : ""}. {line.prescriptionMedicine.durationValue} {line.prescriptionMedicine.durationUnit}; {line.prescriptionMedicine.instructions || "Follow the doctor's instructions."}</Text>
        {line.status === "UNAVAILABLE" ? <Text style={styles.warning}>No reliable catalog match. Contact your doctor or Med4U support.</Text> : null}
        {line.status === "NEEDS_PHARMACIST_REVIEW" ? <Text style={styles.warning}>A match needs pharmacist review or its package quantity cannot be safely confirmed.</Text> : null}
        {line.candidates.map((candidate) => {
          const chosen = selected[key]?.variantId === candidate.id;
          const disabled = !candidate.purchasable || candidate.maxPrescriptionQuantity < 1 || !candidate.quantityUnitKnown;
          return <View key={candidate.id} style={styles.candidate}>
            <View style={styles.flex}><Text style={styles.name}>{candidate.name}</Text><Text style={styles.meta}>{candidate.genericName} · {candidate.strength} · {candidate.form} · {candidate.packSize || "pack size unavailable"}</Text>
              <Text style={styles.meta}>{candidate.purchasable && candidate.price ? `${candidate.price.isEstimate ? "Demo estimate: " : ""}${formatCurrency(candidate.price.sellingPrice)} per pack · ${candidate.stockStatus.toLowerCase().replaceAll("_", " ")}` : "Currently unavailable"}</Text>
              {candidate.isDemo ? <Text style={styles.warning}>Demo catalog listing</Text> : null}
            </View>
            {chosen ? <View style={styles.stepper}>
              <Button title="−" variant="secondary" size="sm" fullWidth={false} accessibilityLabel={`Remove one pack of ${candidate.name}`} disabled={selected[key].quantity <= 1} onPress={() => changeQuantity(key, -1, candidate.maxPrescriptionQuantity)} />
              <Text style={styles.name}>{selected[key].quantity}</Text>
              <Button title="+" variant="secondary" size="sm" fullWidth={false} accessibilityLabel={`Add one pack of ${candidate.name}`} disabled={selected[key].quantity >= candidate.maxPrescriptionQuantity} onPress={() => changeQuantity(key, 1, candidate.maxPrescriptionQuantity)} />
            </View> : <Button title={disabled ? "Review needed" : "Select"} variant="secondary" size="sm" fullWidth={false} disabled={disabled} onPress={() => toggle(key, candidate.id, candidate.maxPrescriptionQuantity)} />}
          </View>;
        })}
      </Card>;
    })}
    <Button title="Review order" disabled={!Object.keys(selected).length || loading} onPress={() => navigation.navigate("Checkout", { clinicalPrescriptionId: route.params.prescriptionId, prescriptionItems: Object.values(selected) })} />
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, heading: { ...typography.h2 }, body: { ...typography.body, color: colors.textMuted }, card: { gap: spacing.sm }, name: { ...typography.bodyBold, color: colors.primaryDark }, meta: { ...typography.caption, color: colors.textMuted }, warning: { ...typography.caption, color: colors.warning }, candidate: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm }, stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, flex: { flex: 1 } });
