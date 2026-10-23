import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OrderDetailsView } from "../../components/order/OrderDetailsView";
import { Button } from "../../components/ui/Button";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { toApiError } from "../../services/api/errors";
import { orderService } from "../../services/order.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "OrderDetail">;

export function OrderDetailScreen({ route }: Props) {
  const { orderId } = route.params;
  const { data: loaded, loading, error, reload } = useAsyncData(() => orderService.getById(orderId), [orderId]);
  useRefreshOnFocus(reload);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const order = loaded;

  const cancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await orderService.cancel(orderId);
    } catch (err) {
      setCancelError(toApiError(err).message);
    } finally {
      setCancelling(false);
      setConfirming(false);
      reload(); // show the order as it really is now (cancelled, or already past the point of cancelling)
    }
  };

  if (loading && !order) {
    return <Loader />;
  }
  if (!order) {
    return <ErrorState message={error ?? "Order not found."} onRetry={reload} />;
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <OrderDetailsView order={order} />
        {cancelError ? (
          <Text style={styles.error} accessibilityRole="alert">
            Couldn&apos;t cancel the order: {cancelError}
          </Text>
        ) : null}
        {order.canCancel ? (
          <Button title="Cancel order" variant="danger" onPress={() => setConfirming(true)} />
        ) : order.status === "PROCESSING" || order.status === "SHIPPED" ? (
          <Text style={styles.note}>
            This order is already with the pharmacy and can no longer be cancelled here. Contact the pharmacy if you
            need to change it.
          </Text>
        ) : null}
      </ScrollView>

      <ConfirmationDialog
        visible={confirming}
        title="Cancel this order?"
        message="The order will be cancelled and its items returned to stock."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        destructive
        loading={cancelling}
        onConfirm={cancel}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  note: {
    ...typography.caption,
    color: colors.textSubtle,
  },
});
