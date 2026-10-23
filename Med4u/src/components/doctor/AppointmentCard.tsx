import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarDays, Clock4, MapPin, Video } from "lucide-react-native";
import { DoctorPortrait } from "./DoctorPortrait";
import { Button } from "../ui/Button";
import { BadgeTone, StatusBadge } from "../ui/StatusBadge";
import { Appointment, AppointmentStatus } from "../../types/appointment";
import { colors } from "../../theme/colors";
import { iconSizes, radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import {
  formatClinicDate,
  formatClinicTime,
  formatCurrency,
} from "../../utils/helpers";

interface AppointmentCardProps {
  appointment: Appointment;
  /** Shown only when the server says the consultation can be joined. */
  onJoin?: () => void;
  /** Shown only when the server says the appointment can be cancelled. */
  onCancel?: () => void;
  /** Offered for completed consultations; the screen decides what to show if nothing was issued yet. */
  onViewPrescription?: () => void;
  cancelling?: boolean;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  rescheduled: "Rescheduled",
};

const STATUS_TONE: Record<AppointmentStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  rescheduled: "neutral",
};

export function AppointmentCard({
  appointment,
  onJoin,
  onCancel,
  onViewPrescription,
  cancelling,
}: AppointmentCardProps) {
  const { doctor, status } = appointment;
  const isVideo = appointment.type === "video";
  const showJoin = appointment.canJoin && onJoin;
  const showCancel = appointment.canCancel && onCancel;
  const showPrescription = status === "completed" && onViewPrescription;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <DoctorPortrait
          doctorId={doctor.id}
          uri={doctor.avatarUrl}
          name={doctor.name}
          gender={doctor.gender}
          isDemo={doctor.isDemo}
          width={48}
          height={48}
        />
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={1}>
            {doctor.name}
          </Text>
          <Text style={styles.specialization} numberOfLines={1}>
            {doctor.specialization}
          </Text>
        </View>
        <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
      </View>

      <View style={styles.detailRow}>
        <View style={styles.row}>
          <CalendarDays size={iconSizes.sm} color={colors.textMuted} />
          <Text style={styles.meta}>{formatClinicDate(appointment.date)}</Text>
        </View>
        <View style={styles.row}>
          <Clock4 size={iconSizes.sm} color={colors.textMuted} />
          <Text style={styles.meta}>
            {formatClinicTime(appointment.startTime)}
          </Text>
        </View>
        <View style={styles.typeChip}>
          {isVideo ? (
            <Video size={12} color={colors.primaryDark} />
          ) : (
            <MapPin size={12} color={colors.primaryDark} />
          )}
          <Text style={styles.typeText}>{isVideo ? "Video" : "In person"}</Text>
        </View>
      </View>

      <Text style={styles.fee}>
        Consultation fee:{" "}
        {appointment.consultationFee === null
          ? "Not recorded"
          : formatCurrency(appointment.consultationFee)}
      </Text>
      {appointment.paymentStatus === "PENDING" ? (
        <Text style={styles.paymentPending}>
          Payment pending · appointment not confirmed
        </Text>
      ) : appointment.paymentStatus === "PAID" ? (
        <Text style={styles.paymentPaid}>Payment paid</Text>
      ) : appointment.paymentStatus === "REFUND_PENDING" ? (
        <Text style={styles.paymentPending}>Refund processing</Text>
      ) : appointment.paymentStatus === "REFUNDED" ? (
        <Text style={styles.paymentPaid}>Payment refunded</Text>
      ) : null}

      {status === "cancelled" && appointment.cancellationReason ? (
        <Text style={styles.reason}>
          Reason: {appointment.cancellationReason}
        </Text>
      ) : null}

      {showJoin || showCancel || showPrescription ? (
        <View style={styles.actions}>
          {showJoin ? (
            <Button
              title="Join call"
              size="sm"
              fullWidth={false}
              onPress={onJoin}
              accessibilityLabel={`Join video call with ${doctor.name}`}
            />
          ) : null}
          {showPrescription ? (
            <Button
              title="View prescription"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={onViewPrescription}
              accessibilityLabel={`View prescription from ${doctor.name}`}
            />
          ) : null}
          {showCancel ? (
            <Button
              title="Cancel"
              accessibilityLabel={`Cancel appointment with ${doctor.name}`}
              size="sm"
              variant="secondary"
              fullWidth={false}
              loading={cancelling}
              onPress={onCancel}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.soft,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyBold,
  },
  specialization: {
    ...typography.caption,
    color: colors.primaryDark,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meta: {
    ...typography.caption,
    color: colors.text,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  typeText: {
    ...typography.caption,
    color: colors.primaryDark,
  },
  reason: {
    ...typography.caption,
    color: colors.textMuted,
  },
  fee: {
    ...typography.caption,
    color: colors.textMuted,
  },
  paymentPending: {
    ...typography.caption,
    color: colors.warning,
  },
  paymentPaid: {
    ...typography.caption,
    color: colors.success,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "flex-end",
  },
});
