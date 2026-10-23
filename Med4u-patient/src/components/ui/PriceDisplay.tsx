import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { formatCurrency } from "../../utils/helpers";

interface PriceDisplayProps {
  /** Amount the customer pays, INR. */
  price: number;
  /** Maximum retail price; shown struck through only when the price is genuinely lower. */
  mrp?: number;
  /** Server-derived percentage; shown only when the price is genuinely lower than the MRP. */
  discountPercent?: number;
  size?: "md" | "lg";
}

export function PriceDisplay({ price, mrp, discountPercent = 0, size = "md" }: PriceDisplayProps) {
  const hasDiscount = mrp !== undefined && mrp > price && discountPercent > 0;
  const label = hasDiscount
    ? `${formatCurrency(price)}, MRP ${formatCurrency(mrp)}, ${discountPercent}% off`
    : formatCurrency(price);

  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Text style={[styles.price, size === "lg" && styles.priceLg]}>{formatCurrency(price)}</Text>
      {hasDiscount ? (
        <>
          <Text style={styles.mrp}>{formatCurrency(mrp)}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{discountPercent}% off</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: spacing.xs,
    rowGap: 2,
  },
  price: {
    ...typography.title,
    color: colors.text,
  },
  priceLg: {
    ...typography.h2,
  },
  mrp: {
    ...typography.caption,
    color: colors.textSubtle,
    textDecorationLine: "line-through",
  },
  badge: {
    backgroundColor: colors.successLight,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.success,
  },
});
