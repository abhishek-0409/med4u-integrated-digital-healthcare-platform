import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCircle2 } from "lucide-react-native";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { toApiError } from "../../services/api/errors";
import { labService } from "../../services/lab.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency } from "../../utils/helpers";
import { formatLabDate } from "../../utils/lab";
import { labStatusTone } from "./BookTestScreen";

type Props = NativeStackScreenProps<MainStackParamList, "LabBookingConfirmation">;

/** Shows a booking exactly as the server returned it, including after a later cancel. */
export function LabBookingConfirmationScreen({ navigation, route }: Props) {
  const [booking, setBooking] = useState(route.params.booking);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = booking.status.replaceAll("_", " ");
  const cancellable = booking.status === "pending" || booking.status === "confirmed";

  const cancel = async () => {
    setCancelling(true); setError(null);
    try { setBooking(await labService.cancel(booking.id)); }
    catch (e) { setError(toApiError(e).message); }
    finally { setCancelling(false); }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`Booking ${booking.reference}, ${status}`}>
          <CheckCircle2 size={iconSizes.xl} color={colors.success} />
          <Text style={styles.heading}>{booking.status === "cancelled" ? "Booking cancelled" : "Booking recorded"}</Text>
          <Text style={styles.reference}>{booking.reference}</Text>
          <StatusBadge label={status} tone={labStatusTone(booking.status)} />
        </View>
        <Card style={styles.card}>
          <Text style={styles.name}>{booking.test.name}</Text>
          <Text style={styles.body}>{formatLabDate(booking.preferredDate)} at {booking.preferredTime}</Text>
          <Text style={styles.body}>{booking.homeCollection ? "Home collection" : "Visit lab"}</Text>
          {booking.address ? <Text style={styles.body}>{booking.address.line1}, {booking.address.city}, {booking.address.state} {booking.address.pincode}</Text> : null}
          <Text style={styles.total}>Total {formatCurrency(booking.priceSnapshot)}</Text>
          {booking.test.isDemo ? <Text style={styles.notice}>Demo listing. This is a recorded request, not a confirmed laboratory appointment, and nothing was charged.</Text> : null}
        </Card>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        {cancellable ? <Button title="Cancel booking" variant="secondary" loading={cancelling} onPress={() => void cancel()} /> : null}
        <Button title="Back to lab tests" onPress={() => navigation.navigate("BookTest")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { alignItems: "center", gap: spacing.xs, padding: spacing.lg, backgroundColor: colors.successLight, borderRadius: radius.lg },
  heading: { ...typography.h2, color: colors.success },
  reference: { ...typography.h3, color: colors.text },
  card: { gap: spacing.xs },
  name: { ...typography.bodyBold, color: colors.text },
  body: { ...typography.body, color: colors.text },
  total: { ...typography.bodyBold, color: colors.primaryDark },
  notice: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningLight, padding: spacing.sm, borderRadius: radius.sm },
  error: { ...typography.body, color: colors.danger },
  footer: { padding: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.xs, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
});
