import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { Order } from "../../types/order";
import { formatCurrency } from "../../utils/helpers";
import {
  formatDateTime,
  ORDER_STATUS,
  orderReference,
  PRESCRIPTION_STATUS,
  REJECTION_TEXT,
} from "../../utils/orderStatus";
import { InfoBanner } from "../ui/InfoBanner";
import { StatusBadge } from "../ui/StatusBadge";

const BY: Record<Order["history"][number]["by"], string> = {
  customer: "You",
  pharmacy: "Pharmacy",
  system: "Med4U",
};

/** Everything about one order, shared by the confirmation and details screens. */
export function OrderDetailsView({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status];
  const prescription = order.prescription;
  const prescriptionStatus = prescription ? PRESCRIPTION_STATUS[prescription.status] : null;
  const savings = order.items.reduce((sum, i) => sum + Math.round((i.mrp - i.unitPrice) * i.quantity * 100), 0) / 100;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.title}>Order {orderReference(order.id)}</Text>
            <Text style={styles.caption}>Placed {formatDateTime(order.createdAt)}</Text>
          </View>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <Text style={styles.body}>{status.description}</Text>
        {order.cancellationReason ? (
          <Text style={styles.reason}>Reason: {order.cancellationReason}</Text>
        ) : null}
      </View>

      {order.isDemo ? (
        <InfoBanner
          title="Demo order"
          message="This is a demonstration order. Nothing was charged and nothing will be delivered."
        />
      ) : (
        <InfoBanner
          tone="warning"
          title="Payment pending"
          message="Online payment isn't available yet, so this order is unpaid and nothing has been charged."
        />
      )}

      {prescription && prescriptionStatus ? (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Prescription</Text>
            <StatusBadge label={prescriptionStatus.label} tone={prescriptionStatus.tone} />
          </View>
          {prescription.status === "PENDING" ? (
            <Text style={styles.body}>
              A pharmacist will review it before your order is processed. Approval confirms review only; it
              doesn&apos;t replace your doctor&apos;s advice.
            </Text>
          ) : null}
          {prescription.status === "APPROVED" ? (
            <Text style={styles.body}>
              Reviewed{prescription.reviewedAt ? ` on ${formatDateTime(prescription.reviewedAt)}` : ""}.
            </Text>
          ) : null}
          {prescription.status === "REJECTED" ? (
            <>
              <Text style={styles.body}>
                {prescription.rejectionReason ? REJECTION_TEXT[prescription.rejectionReason] : "It wasn't accepted."}
              </Text>
              {prescription.reviewerNote ? <Text style={styles.body}>Pharmacist note: {prescription.reviewerNote}</Text> : null}
              <Text style={styles.caption}>Upload a new prescription and place the order again.</Text>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Items</Text>
        {order.items.map((item) => (
          <View key={item.variantId} style={styles.itemRow} accessible>
            <View style={styles.flex}>
              <Text style={styles.itemName}>
                {item.name} × {item.quantity}
              </Text>
              <Text style={styles.caption}>
                {[item.strength, item.form, item.packSize].filter(Boolean).join(" · ")}
                {item.requiresPrescription ? " · Prescription required" : ""}
              </Text>
              <Text style={styles.caption}>{formatCurrency(item.unitPrice)} each</Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(item.lineTotal)}</Text>
          </View>
        ))}
        <View style={[styles.rowBetween, styles.totalRow]}>
          <Text style={styles.sectionTitle}>Total</Text>
          <Text style={styles.total}>{formatCurrency(order.total)}</Text>
        </View>
        {savings > 0 ? <Text style={styles.savings}>You saved {formatCurrency(savings)} against MRP</Text> : null}
        <View style={styles.rowBetween}>
          <Text style={styles.caption}>Payment</Text>
          <Text style={styles.caption}>Unpaid · no payment collected</Text>
        </View>
        <Text style={styles.caption}>Prices are the ones recorded when you placed the order.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Delivery</Text>
        {order.delivery.name ? <Text style={styles.body}>{order.delivery.name}</Text> : null}
        {order.delivery.phone ? <Text style={styles.body}>{order.delivery.phone}</Text> : null}
        <Text style={styles.body}>{order.delivery.address}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Status updates</Text>
        {order.history.map((entry, index) => (
          <View key={`${entry.status}-${entry.at}-${index}`} style={styles.timelineRow} accessible>
            <View style={[styles.dot, index === order.history.length - 1 && styles.dotCurrent]} />
            <View style={styles.flex}>
              <Text style={styles.itemName}>{ORDER_STATUS[entry.status].label}</Text>
              <Text style={styles.caption}>
                {formatDateTime(entry.at)} · {BY[entry.by]}
              </Text>
            </View>
          </View>
        ))}
        <Text style={styles.caption}>
          These are updates recorded by Med4U. Live delivery tracking isn&apos;t available yet.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
  },
  sectionTitle: {
    ...typography.title,
  },
  body: {
    ...typography.body,
  },
  caption: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  reason: {
    ...typography.body,
    color: colors.textMuted,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  itemName: {
    ...typography.bodyBold,
  },
  amount: {
    ...typography.bodyBold,
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    alignItems: "center",
  },
  total: {
    ...typography.h3,
  },
  savings: {
    ...typography.caption,
    color: colors.success,
  },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: 5,
  },
  dotCurrent: {
    backgroundColor: colors.primary,
  },
});
