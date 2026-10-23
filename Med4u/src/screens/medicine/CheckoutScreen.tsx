import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, Circle, FileText } from "lucide-react-native";
import { PrescriptionUploader } from "../../components/prescription/PrescriptionUploader";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { useQuote } from "../../hooks/useQuote";
import { ApiError, toApiError } from "../../services/api/errors";
import { orderService } from "../../services/order.service";
import { prescriptionService } from "../../services/prescription.service";
import { useAuthStore } from "../../store/authStore";
import { useUserStore } from "../../store/userStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { DeliveryDetails } from "../../types/order";
import { CartItem } from "../../types/medicine";
import { medicineService } from "../../services/medicine.service";
import { Prescription } from "../../types/prescription";
import { DeliveryErrors, phoneDigits, toDeliveryRequest, validateDelivery } from "../../utils/delivery";
import { formatCurrency } from "../../utils/helpers";
import { formatDateTime } from "../../utils/orderStatus";

type Props = NativeStackScreenProps<MainStackParamList, "Checkout">;

/** One key per checkout attempt: a retried or double-tapped submit resolves to the same order. */
const newIdempotencyKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const kindLabel = (p: Prescription): string => (p.mimeType === "application/pdf" ? "PDF" : "Photo");

export function CheckoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const storedCart = useUserStore((state) => state.cart);
  const [prescriptionCart, setPrescriptionCart] = useState<CartItem[]>([]);
  const clinicalPrescriptionId = route.params?.clinicalPrescriptionId;
  const requestedPrescriptionItems = route.params?.prescriptionItems;
  useEffect(() => {
    let cancelled = false;
    if (!clinicalPrescriptionId || !requestedPrescriptionItems?.length) { setPrescriptionCart([]); return; }
    Promise.all(requestedPrescriptionItems.map(async ({ variantId, quantity }) => {
      const product = await medicineService.getById(variantId);
      return { id: product.id, product, quantity, seenPrice: product.price?.sellingPrice ?? 0 };
    })).then((items) => { if (!cancelled) setPrescriptionCart(items); })
      .catch((error: unknown) => { if (!cancelled) setFailure(toApiError(error)); });
    return () => { cancelled = true; };
  }, [clinicalPrescriptionId, requestedPrescriptionItems]);
  const cart = clinicalPrescriptionId ? prescriptionCart : storedCart;
  const clearCart = useUserStore((state) => state.clearCart);
  const user = useAuthStore((state) => state.user);

  const [delivery, setDelivery] = useState<DeliveryDetails>({
    name: user?.name ?? "",
    phone: user?.phone ? phoneDigits(user.phone) : "",
    line1: "",
    city: "",
    pincode: "",
  });
  const [touched, setTouched] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Prescription[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [priceChangedFrom, setPriceChangedFrom] = useState<number | null>(null);
  const inFlight = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  // Price the cart afresh for this screen; the total shown here is the one confirmed on submit.
  const { quote, loading: quoting, error: quoteError, reload: reloadQuote, stale } = useQuote(cart);
  const needsPrescription = quote?.requiresPrescription ?? cart.some((i) => i.product.requiresPrescription);

  // Prescriptions uploaded earlier that no order uses yet can be attached again.
  useEffect(() => {
    if (!needsPrescription) return;
    let cancelled = false;
    prescriptionService
      .list({ limit: 20 })
      .then((page) => {
        if (!cancelled) setUploads(page.items.filter((p) => p.status === "PENDING" && !p.orderId));
      })
      .catch(() => undefined); // the picker below still works; this list is a convenience
    return () => {
      cancelled = true;
    };
  }, [needsPrescription]);

  const errors: DeliveryErrors = useMemo(() => validateDelivery(delivery), [delivery]);
  const set = (field: keyof DeliveryDetails) => (value: string) =>
    setDelivery((prev) => ({ ...prev, [field]: value }));
  const shown = (field: keyof DeliveryDetails) => (touched ? errors[field] : undefined);

  const quoteReady = Boolean(quote) && !quoting && !stale;
  const total = quote?.total ?? 0;
  const blocked = quote ? !quote.canCheckout : false;

  const onUploaded = (prescription: Prescription) => {
    setUploads((prev) => [prescription, ...prev.filter((p) => p.id !== prescription.id)]);
    setPrescriptionId(prescription.id);
  };

  const place = async () => {
    setTouched(true);
    if (inFlight.current || cart.length === 0 || !quote) return;
    if (Object.keys(errors).length > 0) return;
    if (needsPrescription && !prescriptionId && !clinicalPrescriptionId) {
      setFailure(
        new ApiError("Add your prescription to order prescription-only medicines.", "http", 422, "PRESCRIPTION_REQUIRED"),
      );
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setFailure(null);
    setPriceChangedFrom(null);
    try {
      const order = await orderService.create({
        // Only ids and quantities leave the device; the server prices the order.
        items: cart.map((item) => ({ variantId: item.id, quantity: item.quantity })),
        delivery: toDeliveryRequest(delivery),
        ...(needsPrescription && !clinicalPrescriptionId && prescriptionId ? { prescriptionId } : {}),
        clinicalPrescriptionId,
        // What the customer is looking at. If prices moved, the server refuses instead of charging more.
        expectedTotal: quote.total,
        idempotencyKey: idempotencyKey.current,
      });
      if (!clinicalPrescriptionId) clearCart();
      navigation.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: "OrderConfirmation", params: { orderId: order.id } }],
      });
    } catch (error) {
      const apiError = toApiError(error);
      setFailure(apiError);
      if (apiError.code === "PRICE_CHANGED") {
        setPriceChangedFrom(quote.total);
      }
      if (apiError.status === 409 || apiError.status === 422) {
        reloadQuote(); // show the up-to-date total / stock before the next attempt
      }
      // A rejected attempt may be retried with a fresh key once the cause has been fixed.
      if (apiError.status && apiError.status < 500) {
        idempotencyKey.current = newIdempotencyKey();
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing to check out"
          message="Your cart is empty."
          actionLabel="Browse medicines"
          onAction={() => navigation.navigate("OrderMedicine")}
        />
      </Screen>
    );
  }

  const hasDemo = cart.some((item) => item.product.isDemo);
  const stockOrPriceProblem =
    failure && ["INSUFFICIENT_STOCK", "MEDICINE_UNAVAILABLE", "MEDICINE_NOT_FOUND", "QUANTITY_LIMIT_EXCEEDED"].includes(failure.code ?? "");

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hasDemo ? (
            <InfoBanner
              title="Demo order"
              message="This is a demonstration order. No payment is collected and no medicines will be delivered."
            />
          ) : (
            <InfoBanner message="Online payment isn't available yet. Your order is recorded as unpaid and nothing is charged." />
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              1. Delivery details
            </Text>
            <Input
              label="Recipient name"
              value={delivery.name}
              onChangeText={set("name")}
              autoCapitalize="words"
              maxLength={100}
              error={shown("name")}
              editable={!submitting}
            />
            <Input
              label="Mobile number"
              value={delivery.phone}
              onChangeText={set("phone")}
              keyboardType="phone-pad"
              maxLength={16}
              hint="10-digit Indian mobile number; the pharmacy may call about your order."
              error={shown("phone")}
              editable={!submitting}
            />
            <Input
              label="Address"
              value={delivery.line1}
              onChangeText={set("line1")}
              placeholder="House / flat, street, area"
              multiline
              numberOfLines={3}
              maxLength={250}
              autoCapitalize="sentences"
              error={shown("line1")}
              editable={!submitting}
            />
            <Input
              label="City"
              value={delivery.city}
              onChangeText={set("city")}
              autoCapitalize="words"
              maxLength={80}
              error={shown("city")}
              editable={!submitting}
            />
            <Input
              label="PIN code"
              value={delivery.pincode}
              onChangeText={set("pincode")}
              keyboardType="number-pad"
              maxLength={6}
              error={shown("pincode")}
              editable={!submitting}
            />
          </View>

          {needsPrescription && !clinicalPrescriptionId ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle} accessibilityRole="header">
                2. Prescription
              </Text>
              <Text style={styles.body}>
                Some medicines in your cart need a prescription. A pharmacist reviews it before your order is
                processed. Your order stays on hold until then, and it isn&apos;t approved automatically.
              </Text>
              {uploads.map((p) => {
                const selected = prescriptionId === p.id;
                const Icon = selected ? CheckCircle2 : Circle;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPrescriptionId(p.id)}
                    disabled={submitting}
                    style={[styles.option, selected && styles.optionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: submitting }}
                    accessibilityLabel={`${kindLabel(p)} uploaded ${formatDateTime(p.createdAt)}`}
                  >
                    <Icon size={iconSizes.md} color={selected ? colors.primary : colors.textMuted} />
                    <FileText size={iconSizes.md} color={colors.textMuted} />
                    <View style={styles.flex}>
                      <Text style={styles.optionTitle}>{kindLabel(p)} prescription</Text>
                      <Text style={styles.caption}>Uploaded {formatDateTime(p.createdAt)}</Text>
                    </View>
                  </Pressable>
                );
              })}
              <PrescriptionUploader onUploaded={onUploaded} disabled={submitting} />
              {touched && !prescriptionId ? (
                <Text style={styles.error} accessibilityRole="alert">
                  Add or select a prescription to continue.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              {needsPrescription && !clinicalPrescriptionId ? "3. Order summary" : "2. Order summary"}
            </Text>
            {quote
              ? quote.lines.map((line) => (
                  <View key={line.variantId} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.product?.name ?? "Unavailable item"} × {line.requestedQuantity}
                      {line.issue ? ` (${line.issue === "NOT_FOUND" ? "no longer sold" : "unavailable"})` : ""}
                    </Text>
                    <Text style={styles.lineAmount}>{line.issue ? "—" : formatCurrency(line.lineTotal)}</Text>
                  </View>
                ))
              : cart.map((item) => (
                  <View key={item.id} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {item.product.name} × {item.quantity}
                    </Text>
                  </View>
                ))}
            <View style={[styles.line, styles.totalLine]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount} accessibilityLiveRegion="polite">
                {quote ? formatCurrency(total) : "…"}
              </Text>
            </View>
            <Text style={styles.caption}>
              {quoteError && !quote
                ? "Couldn't check prices. Check your connection."
                : "Prices and stock are checked by the server when you place the order. Payment: unpaid."}
            </Text>
            {quoteError && !quote ? (
              <Button title="Try again" variant="secondary" size="sm" fullWidth={false} onPress={reloadQuote} />
            ) : null}
          </View>

          {blocked ? (
            <View>
              <InfoBanner
                tone="warning"
                title="Some items can't be ordered"
                message="One or more items are out of stock or no longer available. Review your cart to continue."
              />
              <Button
                title="Review cart"
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={styles.reviewButton}
                onPress={() => navigation.navigate("Cart")}
              />
            </View>
          ) : null}

          {failure ? (
            <View accessibilityLiveRegion="assertive">
              <InfoBanner
                tone="warning"
                title={failure.code === "PRICE_CHANGED" ? "The price changed" : "Order not placed"}
                message={
                  failure.code === "PRICE_CHANGED" && priceChangedFrom !== null
                    ? `Prices changed while you were checking out (was ${formatCurrency(priceChangedFrom)}). Check the updated total above, then place your order again.`
                    : failure.message
                }
              />
              {stockOrPriceProblem ? (
                <Button
                  title="Review cart"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  style={styles.reviewButton}
                  onPress={() => navigation.navigate("Cart")}
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button
            title={quote ? `Place order · ${formatCurrency(total)}` : "Place order"}
            onPress={place}
            loading={submitting}
            disabled={!quoteReady || blocked}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
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
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  caption: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  option: {
    minHeight: sizes.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.mint,
  },
  optionTitle: {
    ...typography.bodyBold,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  lineName: {
    ...typography.body,
    flex: 1,
  },
  lineAmount: {
    ...typography.bodyBold,
  },
  totalLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xxs,
  },
  totalLabel: {
    ...typography.title,
  },
  totalAmount: {
    ...typography.h3,
  },
  reviewButton: {
    marginTop: spacing.xs,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
