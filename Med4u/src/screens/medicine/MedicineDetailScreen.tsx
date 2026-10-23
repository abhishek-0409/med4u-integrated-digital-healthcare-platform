import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShoppingCart } from "lucide-react-native";
import { StockBadge } from "../../components/medicine/MedicineCard";
import { MedicineThumb } from "../../components/medicine/MedicineThumb";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Loader } from "../../components/ui/Loader";
import { PriceDisplay } from "../../components/ui/PriceDisplay";
import { QuantityStepper } from "../../components/ui/QuantityStepper";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAsyncData } from "../../hooks/useAsyncData";
import { medicineService } from "../../services/medicine.service";
import { isOrderable, useUserStore } from "../../store/userStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency, sumRupees } from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "MedicineDetail">;

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <View style={styles.factRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function MedicineDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { data: product, loading, error, reload } = useAsyncData(
    () => medicineService.getById(route.params.medicineId),
    [route.params.medicineId],
  );
  const cart = useUserStore((state) => state.cart);
  const setCartQuantity = useUserStore((state) => state.setCartQuantity);
  const addToCart = useUserStore((state) => state.addToCart);
  const [quantity, setQuantity] = useState(1);

  if (loading) {
    return <Loader />;
  }
  if (error || !product) {
    return (
      <ErrorState
        title={error ? undefined : "Medicine not found"}
        message={error ?? "This product is no longer available."}
        onRetry={error ? reload : undefined}
      />
    );
  }

  const inCart = cart.find((item) => item.id === product.id)?.quantity ?? 0;
  const orderable = isOrderable(product);
  const remaining = Math.max(0, product.maxOrderQuantity - inCart);
  const selected = Math.min(quantity, Math.max(1, remaining));
  const lineTotal = product.price ? sumRupees([product.price.sellingPrice * selected]) : 0;

  const add = () => {
    const wanted = inCart + selected;
    if (inCart === 0) {
      addToCart(product);
    }
    setCartQuantity(product.id, wanted);
    setQuantity(1);
  };

  const pack = [product.strength, product.form, product.packSize].filter(Boolean).join(" · ");

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <MedicineThumb imageUrl={product.imageUrl} category={product.category} size={120} />
          <View style={styles.heroText}>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.generic}>{product.genericName}</Text>
            {pack ? <Text style={styles.pack}>{pack}</Text> : null}
            <View style={styles.badges}>
              {product.requiresPrescription ? <StatusBadge label="Prescription required" tone="warning" /> : null}
              <StockBadge product={product} />
            </View>
          </View>
        </View>

        {product.price ? (
          <View style={styles.priceCard}>
            <PriceDisplay
              size="lg"
              price={product.price.sellingPrice}
              mrp={product.price.mrp}
              discountPercent={product.price.discountPercent}
            />
            <Text style={styles.priceNote}>
              {product.price.isEstimate
                ? "Demo price estimate, not a verified retail price."
                : "Inclusive of all taxes. MRP is the maximum retail price."}
            </Text>
          </View>
        ) : (
          <InfoBanner tone="warning" message="A price is not available for this product right now." />
        )}

        {product.requiresPrescription ? (
          <InfoBanner
            tone="warning"
            title="Prescription required"
            message="This medicine is supplied only against a valid prescription from a registered doctor. Add it to your cart, then upload your prescription at checkout. A pharmacist reviews it before the order is processed."
          />
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product details</Text>
          <Fact label="Generic name" value={product.genericName} />
          <Fact label="Brand" value={product.name} />
          <Fact label="Strength" value={product.strength} />
          <Fact label="Dosage form" value={product.form} />
          <Fact label="Pack size" value={product.packSize} />
          <Fact label="Manufacturer" value={product.manufacturer} />
          <Fact label="Category" value={product.category} />
        </View>

        {product.description ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About this product</Text>
            <Text style={styles.body}>{product.description}</Text>
          </View>
        ) : null}

        <Text style={styles.disclaimer}>
          This listing is general product information. It is not medical advice and does not mean this product is suitable
          for you. Talk to a doctor or pharmacist before using any medicine.
        </Text>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {orderable ? (
          <>
            {remaining > 0 ? (
              <QuantityStepper value={selected} max={remaining} itemName={product.name} onChange={setQuantity} />
            ) : null}
            <View style={styles.actionButtons}>
              {remaining > 0 ? (
                <Button
                  title={`Add to cart · ${formatCurrency(lineTotal)}`}
                  leftIcon={<ShoppingCart size={iconSizes.md} color={colors.white} />}
                  onPress={add}
                />
              ) : (
                <Text style={styles.maxNote}>You've added the maximum available ({inCart}).</Text>
              )}
              {inCart > 0 ? (
                <Button
                  title={`Go to cart (${inCart})`}
                  variant="secondary"
                  onPress={() => navigation.navigate("Cart")}
                />
              ) : null}
            </View>
          </>
        ) : (
          <Button
            title={product.stockStatus === "OUT_OF_STOCK" ? "Out of stock" : "Unavailable"}
            disabled
            variant="secondary"
          />
        )}
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.h2,
  },
  generic: {
    ...typography.body,
    color: colors.textMuted,
  },
  pack: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  priceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  priceNote: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.title,
    marginBottom: spacing.xxs,
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  factLabel: {
    ...typography.body,
    flexShrink: 0,
  },
  factValue: {
    ...typography.bodyBold,
    flex: 1,
    textAlign: "right",
  },
  body: {
    ...typography.body,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSubtle,
    paddingHorizontal: spacing.xxs,
  },
  actionBar: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButtons: {
    gap: spacing.xs,
  },
  maxNote: {
    ...typography.body,
    textAlign: "center",
  },
});
