import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OrderDetailsView } from "../../components/order/OrderDetailsView";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Input } from "../../components/ui/Input";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { toApiError } from "../../services/api/errors";
import { pharmacyService } from "../../services/pharmacy.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { OrderStatus } from "../../types/order";
import { ORDER_STATUS } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "PharmacyOrder">;

/** The one forward step offered for each state; the server enforces the same rules. */
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PLACED: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "PROCESSING", label: "Start preparing" },
  PROCESSING: { status: "SHIPPED", label: "Mark as shipped" },
  SHIPPED: { status: "DELIVERED", label: "Mark as delivered" },
};
/** Staff can cancel until the order ships. */
const CANCELLABLE: OrderStatus[] = ["PLACED", "PENDING_REVIEW", "CONFIRMED", "PROCESSING"];

export function PharmacyOrderScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { data: order, loading, error, reload } = useAsyncData(() => pharmacyService.order(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  if (loading && !order) return <Loader />;
  if (!order) return <ErrorState message={error ?? "Order not found."} onRetry={reload} />;

  const next = NEXT[order.status];
  const update = async (status: OrderStatus, note?: string) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await pharmacyService.updateStatus(orderId, status, note);
      setCancelling(false);
      setReason("");
    } catch (err) {
      setFailure(toApiError(err).message);
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{order.customer.name}</Text>
          <Text style={styles.caption}>{order.customer.phone}</Text>
        </View>

        <OrderDetailsView order={order} />

        {order.clinicalPrescription ? (
          <View style={styles.card}>
            <Text style={styles.title}>Doctor-issued prescription · {order.clinicalPrescription.reference}</Text>
            <Text style={styles.caption}>Diagnosis: {order.clinicalPrescription.diagnosis || "Not specified"}</Text>
            {order.clinicalPrescription.medicines.map((medicine, index) => (
              <Text key={`${medicine.name}-${index}`} style={styles.body}>{medicine.name} {medicine.strength} · {medicine.dosageForm} · {medicine.quantity} {medicine.quantityUnit || ""} · {medicine.durationValue} {medicine.durationUnit}. {medicine.instructions || ""}</Text>
            ))}
            {order.status === "PENDING_REVIEW" ? <Text style={styles.caption}>Confirm order to approve this medicine order after your clinical review, or cancel it to reject and return stock.</Text> : null}
          </View>
        ) : null}

        {order.status === "PENDING_REVIEW" && order.prescription ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              This order is held until its prescription is approved. Approval is done from the prescription review screen.
            </Text>
            <Button
              title="Review prescription"
              onPress={() => navigation.navigate("PharmacyPrescription", { prescriptionId: (order.prescription as { id: string }).id })}
            />
          </View>
        ) : null}

        {failure ? (
          <View accessibilityLiveRegion="assertive">
            <InfoBanner tone="warning" title="Couldn't update the order" message={failure} />
          </View>
        ) : null}

        {next ? <Button title={next.label} loading={busy} onPress={() => update(next.status)} /> : null}
        {order.status === "PENDING_REVIEW" && order.clinicalPrescription ? <Button title="Approve and confirm order" loading={busy} onPress={() => update("CONFIRMED", "Clinical prescription reviewed and approved")} /> : null}
        {CANCELLABLE.includes(order.status) ? (
          <Button title="Cancel order…" variant="danger" disabled={busy} onPress={() => setCancelling(true)} />
        ) : null}
        {order.status === "DELIVERED" || order.status === "CANCELLED" ? (
          <Text style={styles.caption}>This order is {ORDER_STATUS[order.status].label.toLowerCase()} and can&apos;t be changed.</Text>
        ) : null}
      </ScrollView>

      {cancelling ? (
        <View style={styles.sheet}>
          <Input
            label="Reason shown to the customer"
            value={reason}
            onChangeText={setReason}
            maxLength={200}
            hint="Stock is returned automatically."
          />
          <Button title="Cancel this order" variant="danger" loading={busy} onPress={() => update("CANCELLED", reason.trim() || undefined)} />
          <Button title="Keep order" variant="ghost" disabled={busy} onPress={() => setCancelling(false)} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  sheet: { padding: spacing.lg, gap: spacing.xs, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  title: { ...typography.h3 },
  body: { ...typography.body },
  caption: { ...typography.caption, color: colors.textSubtle },
});
