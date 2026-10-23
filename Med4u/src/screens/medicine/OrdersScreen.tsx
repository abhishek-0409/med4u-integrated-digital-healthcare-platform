import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronRight, Receipt } from "lucide-react-native";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { usePaginatedData } from "../../hooks/usePaginatedData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { orderService } from "../../services/order.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency } from "../../utils/helpers";
import { formatDateTime, ORDER_STATUS, orderReference } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "Orders">;

const PAGE_SIZE = 10;

export function OrdersScreen({ navigation }: Props) {
  const { items, loading, loadingMore, error, reload, loadMore } = usePaginatedData(
    (page) => orderService.list({ page, limit: PAGE_SIZE }),
    [],
  );
  // Statuses change on the pharmacy side, so refresh when coming back to the list.
  useRefreshOnFocus(reload);

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshing={loading && items.length > 0}
        onRefresh={reload}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          loading ? (
            <LoadingSkeleton count={3} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <EmptyState
              icon={Receipt}
              title="No orders yet"
              message="Orders you place will appear here."
              actionLabel="Browse medicines"
              onAction={() => navigation.navigate("OrderMedicine")}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : error && items.length > 0 ? (
            <Pressable onPress={reload} style={styles.footer} accessibilityRole="button">
              <Text style={styles.retryText}>{error} Tap to retry.</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const status = ORDER_STATUS[item.status];
          const count = item.items.reduce((n, line) => n + line.quantity, 0);
          return (
            <Pressable
              onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Order ${orderReference(item.id)}, ${status.label}, ${formatCurrency(item.total)}. Open details.`}
            >
              <View style={styles.cardTop}>
                <View style={styles.flex}>
                  <Text style={styles.date}>{formatDateTime(item.createdAt)}</Text>
                  <Text style={styles.orderId}>Order {orderReference(item.id)}</Text>
                </View>
                <StatusBadge label={status.label} tone={status.tone} />
              </View>

              <Text style={styles.lines} numberOfLines={2}>
                {item.items.map((line) => `${line.name} × ${line.quantity}`).join(", ")}
              </Text>

              <View style={styles.cardBottom}>
                <View style={styles.flex}>
                  <Text style={styles.total}>{formatCurrency(item.total)}</Text>
                  <Text style={styles.orderId}>
                    {count} {count === 1 ? "pack" : "packs"} · Unpaid
                    {item.isDemo ? " · Demo order" : ""}
                  </Text>
                </View>
                <ChevronRight size={iconSizes.md} color={colors.textMuted} />
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.9,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  date: {
    ...typography.bodyBold,
  },
  orderId: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  lines: {
    ...typography.body,
    color: colors.textMuted,
  },
  total: {
    ...typography.title,
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  retryText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
