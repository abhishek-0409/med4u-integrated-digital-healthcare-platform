import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCircle2 } from "lucide-react-native";
import { OrderDetailsView } from "../../components/order/OrderDetailsView";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { orderService } from "../../services/order.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { orderReference } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "OrderConfirmation">;

/** Shown only after the server has created the order, so the details are read back from it. */
export function OrderConfirmationScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { data: order, loading, error, reload } = useAsyncData(() => orderService.getById(orderId), [orderId]);

  if (loading) {
    return <Loader />;
  }
  if (error || !order) {
    return (
      <ErrorState
        title="Your order was placed"
        message={`We couldn't load the details just now, but the order is saved. You can find it in My orders. (${error ?? "Not found"})`}
        onRetry={reload}
      />
    );
  }

  const heading = order.awaitingPrescriptionReview ? "Order received" : "Order placed";
  const subheading = order.awaitingPrescriptionReview
    ? `Order ${orderReference(order.id)} is on hold until a pharmacist reviews your prescription.`
    : `Order ${orderReference(order.id)} has been recorded.`;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`${heading}. ${subheading}`}>
          <CheckCircle2 size={iconSizes.xl} color={colors.success} />
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.subheading}>{subheading}</Text>
        </View>
        <OrderDetailsView order={order} />
      </ScrollView>
      <View style={styles.footer}>
        <Button title="View order details" onPress={() => navigation.replace("OrderDetail", { orderId: order.id })} />
        <Button
          title="Continue shopping"
          variant="secondary"
          onPress={() => navigation.reset({ index: 1, routes: [{ name: "Home" }, { name: "OrderMedicine" }] })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xxs,
    padding: spacing.lg,
    backgroundColor: colors.successLight,
    borderRadius: radius.lg,
  },
  heading: {
    ...typography.h2,
    color: colors.success,
  },
  subheading: {
    ...typography.body,
    textAlign: "center",
    color: colors.text,
  },
  footer: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
