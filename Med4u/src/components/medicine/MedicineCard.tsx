import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { PriceDisplay } from "../ui/PriceDisplay";
import { StatusBadge } from "../ui/StatusBadge";
import { MedicineThumb } from "./MedicineThumb";
import { MedicineProduct } from "../../types/medicine";
import { colors } from "../../theme/colors";
import { radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { isOrderable } from "../../store/userStore";

interface MedicineCardProps {
  product: MedicineProduct;
  /** How many packs of this product are already in the cart. */
  inCart?: number;
  onPress: () => void;
  onAdd: () => void;
}

/** "500 mg · tablet · Strip of 15 tablets" */
export const describePack = (p: MedicineProduct): string =>
  [p.strength, p.form, p.packSize].filter(Boolean).join(" · ");

export function StockBadge({ product }: { product: MedicineProduct }) {
  if (product.stockStatus === "OUT_OF_STOCK") {
    return <StatusBadge label="Out of stock" tone="danger" />;
  }
  if (product.stockStatus === "LOW_STOCK") {
    return <StatusBadge label="Low stock" tone="warning" />;
  }
  return <StatusBadge label="In stock" tone="success" />;
}

export function MedicineCard({ product, inCart = 0, onPress, onAdd }: MedicineCardProps) {
  const orderable = isOrderable(product);
  const atCap = inCart >= product.maxOrderQuantity;

  let actionLabel = "Add";
  if (product.stockStatus === "OUT_OF_STOCK") actionLabel = "Unavailable";
  else if (!product.price) actionLabel = "Unavailable";
  else if (atCap && inCart > 0) actionLabel = "Max added";

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${product.genericName}${product.requiresPrescription ? ", prescription required" : ""}. Open details.`}
      >
        <MedicineThumb imageUrl={product.imageUrl} category={product.category} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.generic} numberOfLines={1}>
            {product.genericName}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {describePack(product)}
          </Text>
          <View style={styles.badges}>
            {product.requiresPrescription ? <StatusBadge label="Prescription required" tone="warning" /> : null}
            <StockBadge product={product} />
          </View>
        </View>
      </Pressable>

      <View style={styles.footer}>
        {product.price ? (
          <PriceDisplay
            price={product.price.sellingPrice}
            mrp={product.price.mrp}
            discountPercent={product.price.discountPercent}
          />
        ) : (
          <Text style={styles.meta}>Price unavailable</Text>
        )}
        <Button
          title={actionLabel}
          size="sm"
          fullWidth={false}
          variant={orderable && !atCap ? "primary" : "secondary"}
          disabled={!orderable || atCap}
          onPress={onAdd}
          accessibilityLabel={orderable ? `Add ${product.name} to cart` : `${product.name}: ${actionLabel}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
    ...shadows.soft,
  },
  main: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.9,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyBold,
  },
  generic: {
    ...typography.caption,
    color: colors.textMuted,
  },
  meta: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
});
