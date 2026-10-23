import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  CheckCircle2,
  CalendarDays,
  Clock3,
  Video,
  MapPin,
} from "lucide-react-native";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { appointmentService } from "../../services/appointment.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import {
  formatClinicDate,
  formatClinicTime,
  formatCurrency,
} from "../../utils/helpers";

type Props = NativeStackScreenProps<
  MainStackParamList,
  "AppointmentConfirmation"
>;

export function AppointmentConfirmationScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params;
  const {
    data: appointment,
    loading,
    error,
    reload,
  } = useAsyncData(
    () => appointmentService.get(appointmentId),
    [appointmentId],
  );

  if (loading) return <Loader />;
  if (error || !appointment) {
    return (
      <ErrorState
        title="Confirmation unavailable"
        message={error ?? "We could not load the appointment details."}
        onRetry={reload}
      />
    );
  }

  const isDemoBooking =
    appointment.doctor.isDemo &&
    appointment.paymentStatus === "NOT_REQUIRED";
  const isConfirmed =
    appointment.status === "confirmed" &&
    (isDemoBooking ||
      ["PAID", "REFUND_PENDING", "REFUNDED"].includes(
        appointment.paymentStatus,
      ));
  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, !isConfirmed && styles.pendingHero]}>
          {isConfirmed ? (
            <CheckCircle2 size={iconSizes.xl} color={colors.success} />
          ) : (
            <Clock3 size={iconSizes.xl} color={colors.warning} />
          )}
          <Text style={styles.heading} accessibilityRole="header">
            {isConfirmed
              ? isDemoBooking
                ? "Demo booking confirmed"
                : "Appointment confirmed"
              : "Payment verification pending"}
          </Text>
          <Text style={styles.subheading}>
            {isConfirmed
              ? isDemoBooking
                ? `Your demo booking with ${appointment.doctor.name} is recorded. No payment was collected and no real consultation will take place.`
                : `Your appointment with ${appointment.doctor.name} is confirmed.`
              : "The server has not confirmed this appointment yet. Check the appointment status before relying on this booking."}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.doctorName}>{appointment.doctor.name}</Text>
          <Text style={styles.muted}>{appointment.doctor.specialization}</Text>
          <View style={styles.row}>
            <CalendarDays size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.text}>
              {formatClinicDate(appointment.date)}
            </Text>
          </View>
          <View style={styles.row}>
            <Clock3 size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.text}>
              {formatClinicTime(appointment.startTime)}
            </Text>
          </View>
          <View style={styles.row}>
            {appointment.type === "video" ? (
              <Video size={iconSizes.sm} color={colors.primaryDark} />
            ) : (
              <MapPin size={iconSizes.sm} color={colors.primaryDark} />
            )}
            <Text style={styles.text}>
              {appointment.type === "video"
                ? "Video consultation"
                : "In-person visit"}
            </Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.rowBetween}>
            <Text style={styles.text}>Payment</Text>
            <Text style={styles.paymentStatus}>
              {isDemoBooking
                ? "No charge (demo booking)"
                : appointment.paymentStatus === "PAID"
                ? "Paid"
                : appointment.paymentStatus === "REFUND_PENDING"
                  ? "Refund processing"
                  : appointment.paymentStatus === "REFUNDED"
                    ? "Refunded"
                    : appointment.paymentStatus}
            </Text>
          </View>
          {appointment.consultationFee !== null ? (
            <View style={styles.rowBetween}>
            <Text style={styles.text}>
              {isDemoBooking ? "Displayed fee (not charged)" : "Consultation fee"}
            </Text>
              <Text style={styles.text}>
                {formatCurrency(appointment.consultationFee)}
              </Text>
            </View>
          ) : null}
          {appointment.paymentReference ? (
            <Text style={styles.muted}>
              Payment reference: {appointment.paymentReference}
            </Text>
          ) : null}
          <Text style={styles.muted}>
            Booking reference: {appointment.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title="View my appointments"
          onPress={() =>
            navigation.reset({
              index: 1,
              routes: [
                { name: "Home" },
                { name: "Appointments", params: { bookedId: appointment.id } },
              ],
            })
          }
        />
        <Button
          title="Back to home"
          variant="secondary"
          onPress={() => navigation.popToTop()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.xl,
    backgroundColor: colors.successLight,
    borderRadius: radius.lg,
  },
  pendingHero: { backgroundColor: colors.warningLight },
  heading: { ...typography.h2, textAlign: "center", color: colors.text },
  subheading: {
    ...typography.body,
    textAlign: "center",
    color: colors.textMuted,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doctorName: { ...typography.title, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  text: { ...typography.body, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  paymentStatus: { ...typography.bodyBold, color: colors.primaryDark },
  footer: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
