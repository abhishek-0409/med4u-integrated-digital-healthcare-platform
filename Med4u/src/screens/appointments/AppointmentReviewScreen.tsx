import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import RazorpayCheckout from "react-native-razorpay";
import {
  CalendarDays,
  Clock3,
  CreditCard,
  MapPin,
  ShieldCheck,
  Video,
} from "lucide-react-native";
import { DoctorPortrait } from "../../components/doctor/DoctorPortrait";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { toApiError } from "../../services/api/errors";
import { appointmentService } from "../../services/appointment.service";
import { doctorService } from "../../services/doctor.service";
import { useAuthStore } from "../../store/authStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import {
  formatClinicDate,
  formatClinicTime,
  formatFee,
} from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "AppointmentReview">;
type VerificationPayload = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export function AppointmentReviewScreen({ navigation, route }: Props) {
  const { doctorId, slotId, date, type } = route.params;
  const user = useAuthStore((state) => state.user);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reservedAppointmentId, setReservedAppointmentId] = useState<
    string | null
  >(null);
  const [verificationPayload, setVerificationPayload] =
    useState<VerificationPayload | null>(null);

  const {
    data: doctor,
    loading: doctorLoading,
    error: doctorError,
    reload: reloadDoctor,
  } = useAsyncData(() => doctorService.getById(doctorId), [doctorId]);
  const {
    data: slots,
    loading: slotsLoading,
    error: slotsError,
    reload: reloadSlots,
  } = useAsyncData(
    () => doctorService.getAvailability(doctorId, date),
    [doctorId, date],
  );
  const {
    data: paymentConfig,
    loading: configLoading,
    error: configError,
    reload: reloadConfig,
  } = useAsyncData<{ enabled: boolean; keyId?: string }>(
    () =>
      doctor?.isDemo
        ? Promise.resolve({ enabled: false })
        : appointmentService.paymentConfiguration(),
    [doctor?.isDemo],
  );

  const slot = slots?.find(
    (candidate) => candidate.id === slotId && candidate.isAvailable,
  );

  const finishVerification = async (
    appointmentId: string,
    payload: VerificationPayload,
  ) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const appointment = await appointmentService.verifyPayment(
        appointmentId,
        payload,
      );
      if (
        appointment.status !== "confirmed" ||
        appointment.paymentStatus !== "PAID"
      ) {
        throw new Error(
          "The server has not confirmed this payment yet. Please retry verification.",
        );
      }
      navigation.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "AppointmentConfirmation",
            params: { appointmentId: appointment.id },
          },
        ],
      });
    } catch (error) {
      setErrorMessage(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  };

  const beginPayment = async () => {
    if (
      !doctor ||
      doctor.isDemo ||
      !slot ||
      busy ||
      !paymentConfig?.enabled ||
      !paymentConfig.keyId
    )
      return;
    setBusy(true);
    setErrorMessage(null);
    let heldAppointmentId: string | null = null;
    let checkoutReturned = false;
    try {
      const order = await appointmentService.createPaymentOrder({
        doctorId,
        slotId,
        type,
      });
      heldAppointmentId = order.appointment.id;
      setReservedAppointmentId(heldAppointmentId);
      const result = await RazorpayCheckout.open({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Med4U",
        description: `Consultation with ${doctor.name}`,
        prefill: {
          name: user?.name ?? undefined,
          email: user?.email ?? undefined,
          contact: user?.phone ?? undefined,
        },
        theme: { color: colors.primaryDark },
      });
      checkoutReturned = true;
      const payload = {
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpaySignature: result.razorpay_signature,
      };
      setVerificationPayload(payload);
      await finishVerification(heldAppointmentId, payload);
    } catch (error) {
      if (heldAppointmentId && !checkoutReturned) {
        await appointmentService
          .cancelPaymentReservation(heldAppointmentId)
          .catch(() => undefined);
        setReservedAppointmentId(null);
      }
      setErrorMessage(toApiError(error).message);
      setBusy(false);
    }
  };

  const beginDemoBooking = async () => {
    if (!doctor?.isDemo || !slot || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const appointment = await appointmentService.createDemoBooking({
        doctorId,
        slotId,
        type,
      });
      if (
        appointment.status !== "confirmed" ||
        appointment.paymentStatus !== "NOT_REQUIRED" ||
        !appointment.doctor.isDemo
      ) {
        throw new Error("The server did not confirm this demo booking.");
      }
      navigation.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "AppointmentConfirmation",
            params: { appointmentId: appointment.id },
          },
        ],
      });
    } catch (error) {
      setErrorMessage(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  };

  if (doctorLoading || slotsLoading || (!doctor?.isDemo && configLoading)) return <Loader />;
  if (doctorError || !doctor) {
    return (
      <ErrorState
        title="Doctor details unavailable"
        message={doctorError ?? "This doctor is unavailable."}
        onRetry={reloadDoctor}
      />
    );
  }
  if (slotsError)
    return (
      <ErrorState
        title="Appointment time unavailable"
        message={slotsError}
        onRetry={reloadSlots}
      />
    );
  if (!doctor.isDemo && (configError || !paymentConfig)) {
    return (
      <ErrorState
        title="Payment status unavailable"
        message={configError ?? "We could not check payment availability."}
        onRetry={reloadConfig}
      />
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">
          Review appointment
        </Text>
        {!slot ? (
          <InfoBanner
            title="Time no longer available"
            message="This slot is no longer available. Return to the calendar and choose another time."
            tone="warning"
          />
        ) : null}
        {doctor.isDemo ? (
          <InfoBanner
            title="Demo profile"
            message="Demo booking only: no payment is collected, and this fictional doctor cannot provide a real consultation."
            tone="warning"
          />
        ) : null}
        <View style={styles.doctorCard}>
          <DoctorPortrait
            doctorId={doctor.id}
            uri={doctor.avatarUrl}
            name={doctor.name}
            gender={doctor.gender}
            isDemo={doctor.isDemo}
            width={64}
            height={64}
          />
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName}>{doctor.name}</Text>
            <Text style={styles.muted}>{doctor.specialization}</Text>
          </View>
        </View>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <CalendarDays size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.detailText}>{formatClinicDate(date)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Clock3 size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.detailText}>
              {slot ? formatClinicTime(slot.startTime) : "Selected time"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            {type === "video" ? (
              <Video size={iconSizes.sm} color={colors.primaryDark} />
            ) : (
              <MapPin size={iconSizes.sm} color={colors.primaryDark} />
            )}
            <Text style={styles.detailText}>
              {type === "video" ? "Video consultation" : "In-person visit"}
            </Text>
          </View>
        </View>
        <View style={styles.patientCard}>
          <Text style={styles.sectionTitle}>Patient</Text>
          <Text style={styles.detailText}>
            {user?.name || "Authenticated account"}
          </Text>
          <Text style={styles.muted}>
            {user?.phone ?? "Contact information from your account"}
          </Text>
        </View>
        <View style={styles.feeCard}>
          <View style={styles.detailRow}>
            <CreditCard size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.detailText}>Consultation fee</Text>
          </View>
          <Text style={styles.fee}>
            {formatFee(doctor.consultationFee)}
          </Text>
          <Text style={styles.muted}>
            {doctor.isDemo
              ? "This fee is shown for demonstration only. No payment is collected."
              : "The final amount is calculated and validated by the server when the payment order is created."}
          </Text>
        </View>
        <View style={styles.secureNote}>
          <ShieldCheck size={iconSizes.sm} color={colors.primaryDark} />
          <Text style={styles.muted}>
            {doctor.isDemo
              ? "The server will confirm this demo booking. It does not include a real consultation or charge."
              : "Your appointment is confirmed only after the payment provider and Med4U server verify payment."}
          </Text>
        </View>
        {!doctor.isDemo && !paymentConfig?.enabled ? (
          <InfoBanner
            title="Online payment unavailable"
            message="Appointment payments have not been configured for this environment. No appointment has been booked."
            tone="warning"
          />
        ) : null}
        {errorMessage ? (
          <Text style={styles.error} accessibilityLiveRegion="assertive">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {verificationPayload && reservedAppointmentId ? (
          <Button
            title="Retry payment verification"
            loading={busy}
            onPress={() =>
              void finishVerification(
                reservedAppointmentId,
                verificationPayload,
              )
            }
          />
        ) : (
          <Button
            title={
              busy
                ? doctor.isDemo
                  ? "Confirming demo booking…"
                  : "Opening secure checkout…"
                : doctor.isDemo
                  ? "Confirm demo booking · no charge"
                  : "Continue to secure payment"
            }
            loading={busy}
            disabled={!slot || (!doctor.isDemo && !paymentConfig?.enabled)}
            onPress={() =>
              void (doctor.isDemo ? beginDemoBooking() : beginPayment())
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { ...typography.h2, color: colors.text },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  doctorInfo: { flex: 1, gap: 4 },
  doctorName: { ...typography.title, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  detailsCard: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  detailText: { ...typography.body, color: colors.text },
  patientCard: {
    padding: spacing.md,
    gap: spacing.xxs,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  sectionTitle: { ...typography.bodyBold, color: colors.text },
  feeCard: {
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  fee: { ...typography.h2, color: colors.primaryDark },
  secureNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  error: { ...typography.caption, color: colors.danger },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
