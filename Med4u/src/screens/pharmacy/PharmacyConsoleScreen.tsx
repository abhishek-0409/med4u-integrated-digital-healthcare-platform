import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ClipboardList, Receipt } from "lucide-react-native";
import { Button } from "../../components/ui/Button";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { usePaginatedData } from "../../hooks/usePaginatedData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { pharmacyService } from "../../services/pharmacy.service";
import { useAuthStore } from "../../store/authStore";
import { colors } from "../../theme/colors";
import { radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { OrderStatus, PrescriptionReviewStatus } from "../../types/order";
import { formatCurrency } from "../../utils/helpers";
import { formatDateTime, ORDER_STATUS, orderReference } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "PharmacyConsole">;
type Tab = "prescriptions" | "orders";

const RX_FILTERS: Array<{ value: PrescriptionReviewStatus; label: string }> = [
  { value: "PENDING", label: "Awaiting review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];
const ORDER_FILTERS: Array<{ value: OrderStatus | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "PENDING_REVIEW", label: "Awaiting review" },
  { value: "PLACED", label: "Placed" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PROCESSING", label: "Preparing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Pharmacist / admin home: prescription review queue and order management. */
export function PharmacyConsoleScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>("prescriptions");
  const [rxStatus, setRxStatus] = useState<PrescriptionReviewStatus>("PENDING");
  const [orderStatus, setOrderStatus] = useState<OrderStatus | undefined>("PENDING_REVIEW");
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const rx = usePaginatedData((page) => pharmacyService.prescriptions({ status: rxStatus, page, limit: 20 }), [rxStatus]);
  const orders = usePaginatedData((page) => pharmacyService.orders({ status: orderStatus, page, limit: 20 }), [orderStatus]);
  useRefreshOnFocus(() => {
    rx.reload();
    orders.reload();
  });

  const footer = (loadingMore: boolean) => (loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.title}>Pharmacy console</Text>
          <Text style={styles.caption}>Signed in as {user?.name || "staff"}</Text>
        </View>
        <Button title="Sign out" variant="ghost" size="sm" fullWidth={false} onPress={() => void logout()} />
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        <CategoryChip label="Prescriptions" selected={tab === "prescriptions"} onPress={() => setTab("prescriptions")} />
        <CategoryChip label="Orders" selected={tab === "orders"} onPress={() => setTab("orders")} />
      </View>

      {tab === "prescriptions" ? (
        <FlatList
          data={rx.items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          onEndReached={rx.loadMore}
          onEndReachedThreshold={0.4}
          refreshing={rx.loading && rx.items.length > 0}
          onRefresh={rx.reload}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.chips}>
              {RX_FILTERS.map((f) => (
                <CategoryChip key={f.value} label={f.label} selected={rxStatus === f.value} onPress={() => setRxStatus(f.value)} />
              ))}
            </View>
          }
          ListEmptyComponent={
            rx.loading ? (
              <LoadingSkeleton count={3} />
            ) : rx.error ? (
              <ErrorState message={rx.error} onRetry={rx.reload} />
            ) : (
              <EmptyState icon={ClipboardList} title="Nothing here" message={rxStatus === "PENDING" ? "No prescriptions are waiting for review." : "No prescriptions with this status."} />
            )
          }
          ListFooterComponent={footer(rx.loadingMore)}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("PharmacyPrescription", { prescriptionId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Prescription from ${item.patientName}, ${item.order?.items.length ?? 0} medicines. Open to review.`}
            >
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{item.patientName}</Text>
                  <Text style={styles.caption}>Submitted {formatDateTime(item.submittedAt)}</Text>
                </View>
                <StatusBadge
                  label={item.status === "PENDING" ? "Awaiting review" : item.status === "APPROVED" ? "Approved" : "Rejected"}
                  tone={item.status === "PENDING" ? "warning" : item.status === "APPROVED" ? "success" : "danger"}
                />
              </View>
              {item.order ? (
                <Text style={styles.body} numberOfLines={2}>
                  {item.order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={orders.items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          onEndReached={orders.loadMore}
          onEndReachedThreshold={0.4}
          refreshing={orders.loading && orders.items.length > 0}
          onRefresh={orders.reload}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.chips}>
              {ORDER_FILTERS.map((f) => (
                <CategoryChip key={f.label} label={f.label} selected={orderStatus === f.value} onPress={() => setOrderStatus(f.value)} />
              ))}
            </View>
          }
          ListEmptyComponent={
            orders.loading ? (
              <LoadingSkeleton count={3} />
            ) : orders.error ? (
              <ErrorState message={orders.error} onRetry={orders.reload} />
            ) : (
              <EmptyState icon={Receipt} title="No orders" message="No orders match this filter." />
            )
          }
          ListFooterComponent={footer(orders.loadingMore)}
          renderItem={({ item }) => {
            const s = ORDER_STATUS[item.status];
            return (
              <Pressable
                onPress={() => navigation.navigate("PharmacyOrder", { orderId: item.id })}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Order ${orderReference(item.id)} for ${item.customer.name}, ${s.label}, ${formatCurrency(item.total)}`}
              >
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.name}>
                      {orderReference(item.id)} · {item.customer.name}
                    </Text>
                    <Text style={styles.caption}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                  <StatusBadge label={s.label} tone={s.tone} />
                </View>
                <Text style={styles.body} numberOfLines={2}>
                  {item.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                </Text>
                <Text style={styles.caption}>{formatCurrency(item.total)} · Unpaid</Text>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.xs, gap: spacing.sm },
  title: { ...typography.h2 },
  tabs: { flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
  footer: { paddingVertical: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.soft,
  },
  pressed: { opacity: 0.9 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  name: { ...typography.bodyBold },
  body: { ...typography.body, color: colors.textMuted },
  caption: { ...typography.caption, color: colors.textSubtle },
});
