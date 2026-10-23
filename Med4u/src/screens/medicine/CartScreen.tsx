import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShoppingCart, Trash2 } from "lucide-react-native";
import { MedicineThumb } from "../../components/medicine/MedicineThumb";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { QuantityStepper } from "../../components/ui/QuantityStepper";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useQuote } from "../../hooks/useQuote";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { useAuthStore } from "../../store/authStore";
import { isOrderable, sellingPriceOf, useUserStore } from "../../store/userStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, shadows, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { QuoteIssue } from "../../types/order";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency, sumRupees } from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "Cart">;

const ISSUE_TEXT: Record<QuoteIssue, string> = {
  NOT_FOUND: "No longer available",
  UNPRICED: "Price unavailable",
  OUT_OF_STOCK: "Out of stock",
  INSUFFICIENT_STOCK: "Not enough stock",
};

export function CartScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const cart = useUserStore((state) => state.cart);
  const cartOwner = useUserStore((state) => state.cartOwner);
  const setCartQuantity = useUserStore((state) => state.setCartQuantity);
  const removeFromCart = useUserStore((state) => state.removeFromCart);
  const syncCartProducts = useUserStore((state) => state.syncCartProducts);
  const acknowledgePrices = useUserStore((state) => state.acknowledgePrices);
  const hydrateCart = useUserStore((state) => state.hydrateCart);
  const userId = useAuthStore((state) => state.user?.id);
  const [notices, setNotices] = useState<string[]>([]);

  // A saved cart that could not be restored earlier (offline) gets another chance here.
  useEffect(() => {
    if (userId && cartOwner !== userId) {
      void hydrateCart(userId);
    }
  }, [userId, cartOwner, hydrateCart]);

  const { quote, loading, error, reload, stale } = useQuote(cart);
  useRefreshOnFocus(reload);

  // Fold the server's view back into the cart: fresh names/prices/stock, drop discontinued items,
  // and trim quantities to what is actually available.
  useEffect(() => {
    if (!quote) return;
    const messages: string[] = [];
    const fresh = quote.lines.flatMap((line) => (line.product ? [line.product] : []));
    for (const line of quote.lines) {
      const inCart = useUserStore.getState().cart.find((item) => item.id === line.variantId);
      if (!inCart) continue;
      if (line.issue === "NOT_FOUND") {
        removeFromCart(line.variantId);
        messages.push(`${inCart.product.name} is no longer available and was removed.`);
      } else if (line.issue === "INSUFFICIENT_STOCK" && line.availableQuantity > 0) {
        setCartQuantity(line.variantId, line.availableQuantity);
        messages.push(`Only ${line.availableQuantity} of ${inCart.product.name} available; quantity reduced.`);
      }
    }
    syncCartProducts(fresh);
    if (messages.length > 0) setNotices((prev) => [...prev, ...messages]);
  }, [quote, removeFromCart, setCartQuantity, syncCartProducts]);

  const issues = useMemo(() => {
    const map = new Map<string, QuoteIssue>();
    quote?.lines.forEach((line) => {
      if (line.issue) map.set(line.variantId, line.issue);
    });
    return map;
  }, [quote]);

  const lineUnavailable = (id: string, orderable: boolean): QuoteIssue | null =>
    issues.get(id) ?? (orderable ? null : "OUT_OF_STOCK");

  const priceChanges = cart.filter(
    (item) => isOrderable(item.product) && sellingPriceOf(item.product) !== item.seenPrice,
  );
  const unavailable = cart.filter((item) => lineUnavailable(item.id, isOrderable(item.product)) !== null);

  // The server's number once it has priced this exact cart; a local estimate in the meantime.
  const estimate = useMemo(
    () =>
      sumRupees(
        cart.filter((i) => isOrderable(i.product)).map((i) => sellingPriceOf(i.product) * i.quantity),
      ),
    [cart],
  );
  const mrpTotal = useMemo(
    () =>
      sumRupees(
        cart.filter((i) => isOrderable(i.product)).map((i) => (i.product.price?.mrp ?? 0) * i.quantity),
      ),
    [cart],
  );
  const serverTotal = quote && !stale && !loading ? quote.total : null;
  const total = serverTotal ?? estimate;
  const savings = Math.max(0, sumRupees([mrpTotal, -estimate]));
  const packs = cart.reduce((n, item) => n + item.quantity, 0);
  const hasDemo = cart.some((item) => item.product.isDemo);
  const hasRx = cart.some((item) => item.product.requiresPrescription);
  const canProceed = Boolean(quote?.canCheckout) && !stale && !loading && unavailable.length === 0;

  if (cart.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          message="Browse the pharmacy and add products to continue."
          actionLabel="Browse medicines"
          onAction={() => navigation.navigate("OrderMedicine")}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={cart}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.banners}>
            {hasDemo ? (
              <InfoBanner
                title="Demo products"
                message="Prices are demonstration estimates. No payment is taken and nothing is delivered."
              />
            ) : null}
            {hasRx ? (
              <InfoBanner
                tone="warning"
                title="Prescription needed"
                message="Your cart has prescription-only medicines. You'll add your prescription at checkout, and a pharmacist reviews it before the order is processed."
              />
            ) : null}
            {notices.length > 0 ? (
              <View accessibilityLiveRegion="polite">
                <InfoBanner tone="warning" title="Your cart was updated" message={notices.join("\n")} />
                <Button
                  title="Dismiss"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onPress={() => setNotices([])}
                />
              </View>
            ) : null}
            {priceChanges.length > 0 ? (
              <View accessibilityLiveRegion="polite">
                <InfoBanner
                  tone="warning"
                  title="Prices changed"
                  message={`${priceChanges.length === 1 ? "One item has" : `${priceChanges.length} items have`} a new price since you added ${priceChanges.length === 1 ? "it" : "them"}. The total below is up to date.`}
                />
                <Button
                  title="Got it"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onPress={acknowledgePrices}
                />
              </View>
            ) : null}
            {error && !quote ? (
              <View accessibilityLiveRegion="polite">
                <InfoBanner
                  tone="warning"
                  title="Can't check prices right now"
                  message="We couldn't verify your cart with the server. Check your connection and try again."
                />
                <Button title="Try again" variant="ghost" size="sm" fullWidth={false} onPress={reload} />
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const orderable = isOrderable(item.product);
          const issue = lineUnavailable(item.id, orderable);
          const price = sellingPriceOf(item.product);
          const priceChanged = orderable && price !== item.seenPrice;
          return (
            <View style={[styles.item, issue && styles.itemUnavailable]}>
              <MedicineThumb
                imageUrl={item.product.imageUrl}
                category={item.product.category}
                size={sizes.thumbnail - 16}
              />
              <View style={styles.itemBody}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.product.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.product.strength, item.product.packSize].filter(Boolean).join(" · ")}
                </Text>
                <View style={styles.badges}>
                  {item.product.requiresPrescription ? (
                    <StatusBadge label="Prescription required" tone="warning" />
                  ) : null}
                  {issue ? <StatusBadge label={ISSUE_TEXT[issue]} tone="danger" /> : null}
                  {!issue && item.product.stockStatus === "LOW_STOCK" ? (
                    <StatusBadge label={`Only ${item.product.maxOrderQuantity} left`} tone="warning" />
                  ) : null}
                </View>
                {orderable ? (
                  <Text style={styles.unit}>
                    {formatCurrency(price)} each
                    {priceChanged ? ` (was ${formatCurrency(item.seenPrice)})` : ""}
                  </Text>
                ) : null}
                {orderable ? (
                  <View style={styles.itemFooter}>
                    <QuantityStepper
                      value={item.quantity}
                      max={item.product.maxOrderQuantity}
                      itemName={item.product.name}
                      onChange={(q) => setCartQuantity(item.id, q)}
                    />
                    <Text style={styles.lineTotal}>{formatCurrency(sumRupees([price * item.quantity]))}</Text>
                  </View>
                ) : (
                  <Text style={styles.cap}>Remove this item to continue.</Text>
                )}
                {orderable && item.quantity >= item.product.maxOrderQuantity ? (
                  <Text style={styles.cap}>Maximum available quantity added</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => removeFromCart(item.id)}
                hitSlop={8}
                style={styles.remove}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.product.name} from cart`}
              >
                <Trash2 size={iconSizes.md} color={colors.textMuted} />
              </Pressable>
            </View>
          );
        }}
      />

      <View style={[styles.summary, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        {unavailable.length > 0 ? (
          <Button
            title="Remove unavailable items"
            variant="secondary"
            size="sm"
            onPress={() => unavailable.forEach((item) => removeFromCart(item.id))}
          />
        ) : null}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            Items ({packs} {packs === 1 ? "pack" : "packs"})
          </Text>
          <Text style={styles.rowValue}>{formatCurrency(total)}</Text>
        </View>
        {savings > 0 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Savings vs MRP</Text>
            <Text style={[styles.rowValue, styles.savings]}>{formatCurrency(savings)}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.totalLabel}>{serverTotal === null ? "Estimated total" : "Total"}</Text>
          <Text style={styles.totalValue} accessibilityLiveRegion="polite">
            {formatCurrency(total)}
          </Text>
        </View>
        <Text style={styles.note}>
          {serverTotal === null
            ? "Checking current prices and stock…"
            : "Priced by the server just now. It is checked again when you place the order."}
        </Text>
        <Button
          title="Proceed to checkout"
          disabled={!canProceed}
          onPress={() => navigation.navigate("Checkout")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  banners: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
  item: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.soft,
  },
  itemUnavailable: {
    borderColor: colors.danger,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  name: {
    ...typography.bodyBold,
  },
  meta: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  unit: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  lineTotal: {
    ...typography.title,
  },
  cap: {
    ...typography.caption,
    color: colors.warning,
  },
  remove: {
    width: sizes.touchTarget - 8,
    height: sizes.touchTarget - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    ...typography.body,
  },
  rowValue: {
    ...typography.bodyBold,
  },
  savings: {
    color: colors.success,
  },
  totalLabel: {
    ...typography.title,
  },
  totalValue: {
    ...typography.h3,
  },
  note: {
    ...typography.caption,
    color: colors.textSubtle,
    marginBottom: spacing.xs,
  },
});
