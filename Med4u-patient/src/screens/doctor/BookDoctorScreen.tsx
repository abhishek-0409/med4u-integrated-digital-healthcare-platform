import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CalendarDays, Clock3, MapPin, Video } from "lucide-react-native";
import { DoctorPortrait } from "../../components/doctor/DoctorPortrait";
import { Button } from "../../components/ui/Button";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loader } from "../../components/ui/Loader";
import { useAsyncData } from "../../hooks/useAsyncData";
import { doctorService } from "../../services/doctor.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { AppointmentType } from "../../types/appointment";
import { ConsultationMode, TimeSlot } from "../../types/doctor";
import { MainStackParamList } from "../../types/navigation";
import {
  addClinicDays,
  clinicDayOfMonth,
  clinicWeekday,
  formatClinicDate,
  formatClinicTime,
  formatFee,
  todayInClinic,
} from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "BookDoctor">;

// Inclusive of today; keep the 60-day horizon aligned with backend MAX_ADVANCE_DAYS.
const BOOKING_WINDOW_DAYS = 61;

const SHIFTS = [
  { label: "Morning", matches: (hour: number) => hour < 12 },
  { label: "Afternoon", matches: (hour: number) => hour >= 12 && hour < 17 },
  { label: "Evening", matches: (hour: number) => hour >= 17 },
] as const;

const defaultTypeFor = (mode: ConsultationMode): AppointmentType =>
  mode === "OFFLINE" ? "in_person" : "video";

const TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
  { value: "video", label: "Video" },
  { value: "in_person", label: "In person" },
];

export function BookDoctorScreen({ navigation, route }: Props) {
  const { doctorId } = route.params;
  const dates = useMemo(() => {
    const today = todayInClinic();
    return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) =>
      addClinicDays(today, i),
    );
  }, []);

  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [chosenType, setChosenType] = useState<AppointmentType | null>(null);

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
    () => doctorService.getAvailability(doctorId, selectedDate),
    [doctorId, selectedDate, chosenType],
  );

  if (doctorLoading) {
    return <Loader />;
  }

  if (doctorError || !doctor) {
    return (
      <ErrorState
        title={doctorError ? undefined : "Doctor not found"}
        message={
          doctorError ?? "This doctor is no longer available for booking."
        }
        onRetry={doctorError ? reloadDoctor : undefined}
      />
    );
  }

  const type = chosenType ?? defaultTypeFor(doctor.consultationMode);
  const offersBothTypes = doctor.consultationMode === "BOTH";
  const visibleSlots = slotsLoading
    ? []
    : (slots ?? []).filter((slot) => slot.isAvailable);

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const onReview = () => {
    if (!selectedSlot) {
      return;
    }
    navigation.navigate("AppointmentReview", {
      doctorId: doctor.id,
      slotId: selectedSlot.id,
      date: selectedSlot.date,
      type,
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {doctor.isDemo ? (
          <InfoBanner message="This is a fictional demo profile. Paid booking is available, but no real consultation with this doctor will take place." />
        ) : null}
        <View style={styles.doctorRow}>
          <DoctorPortrait
            doctorId={doctor.id}
            uri={doctor.avatarUrl}
            name={doctor.name}
            gender={doctor.gender}
            isDemo={doctor.isDemo}
            width={sizes.avatarMd}
            height={sizes.avatarMd}
          />
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorName} numberOfLines={2}>
              {doctor.name}
            </Text>
            <Text style={styles.doctorMeta}>{doctor.specialization}</Text>
            {doctor.isDemo ? (
              <StatusBadge label="Demo profile" tone="info" />
            ) : null}
          </View>
        </View>

        <View style={styles.headerCard}>
          <CalendarDays size={iconSizes.md} color={colors.primaryDark} />
          <Text style={styles.headerTitle}>Choose Date</Text>
        </View>

        <FlatList
          horizontal
          data={dates}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateList}
          renderItem={({ item }) => {
            const active = selectedDate === item;
            return (
              <Pressable
                onPress={() => selectDate(item)}
                style={[styles.dateItem, active && styles.dateItemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatClinicDate(item)}
              >
                <Text style={[styles.dateDay, active && styles.dateDayActive]}>
                  {clinicWeekday(item)}
                </Text>
                <Text style={[styles.dateNum, active && styles.dateNumActive]}>
                  {clinicDayOfMonth(item)}
                </Text>
              </Pressable>
            );
          }}
        />

        {offersBothTypes ? (
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((option) => {
              const active = type === option.value;
              return (
                <CategoryChip
                  key={option.value}
                  label={option.label}
                  selected={active}
                  onPress={() => {
                    setChosenType(option.value);
                    setSelectedSlot(null);
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.fixedType}>
            {type === "video" ? (
              <Video size={iconSizes.sm} color={colors.primaryDark} />
            ) : (
              <MapPin size={iconSizes.sm} color={colors.primaryDark} />
            )}
            <Text style={styles.fixedTypeText}>
              {type === "video" ? "Video consultation" : "In-person visit"}
            </Text>
          </View>
        )}

        <View style={styles.headerCard}>
          <Clock3 size={iconSizes.md} color={colors.primaryDark} />
          <Text style={styles.headerTitle}>Choose Time</Text>
        </View>

        {slotsLoading ? (
          <ActivityIndicator
            style={styles.slotsLoading}
            color={colors.primary}
          />
        ) : slotsError ? (
          <View style={styles.inlineError}>
            <Text style={styles.errorText}>{slotsError}</Text>
            <Button
              title="Try again"
              size="sm"
              fullWidth={false}
              onPress={reloadSlots}
            />
          </View>
        ) : visibleSlots.length === 0 ? (
          <Text style={styles.emptyText}>
            No available appointment times on this day. Try another date.
          </Text>
        ) : (
          <>
            {SHIFTS.map((shift) => {
              const shiftSlots = visibleSlots.filter((slot) =>
                shift.matches(Number(slot.startTime.slice(0, 2))),
              );
              if (shiftSlots.length === 0) {
                return null;
              }
              return (
                <View key={shift.label} style={styles.shiftBlock}>
                  <Text style={styles.shiftTitle}>{shift.label}</Text>
                  <View style={styles.slotGrid}>
                    {shiftSlots.map((slot) => {
                      const active = selectedSlot?.id === slot.id;
                      return (
                        <Pressable
                          key={slot.id}
                          onPress={() => {
                            setSelectedSlot(slot);
                          }}
                          style={[
                            styles.slotItem,
                            active && styles.slotItemActive,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatClinicTime(slot.startTime)}, available`}
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={[
                              styles.slotText,
                              active && styles.slotTextActive,
                            ]}
                          >
                            {formatClinicTime(slot.startTime)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {selectedSlot ? (
          <Text style={styles.summary}>
            {formatClinicDate(selectedSlot.date)} ·{" "}
            {formatClinicTime(selectedSlot.startTime)} ·{" "}
            {type === "video" ? "Video" : "In person"}
          </Text>
        ) : null}
        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Consultation fee</Text>
          <Text style={styles.feeValue}>
            {formatFee(doctor.consultationFee)}
          </Text>
        </View>
        <View style={[styles.feeRow, styles.feeTotal]}>
          <Text style={styles.feeTotalLabel}>Total payable</Text>
          <Text style={styles.feeTotalValue}>
            {formatFee(doctor.consultationFee)}
          </Text>
        </View>
        {doctor.consultationFee == null ? (
          <Text style={styles.feeLabel} accessibilityLiveRegion="polite">
            This doctor has not published a consultation fee, so online booking is unavailable.
          </Text>
        ) : null}
        <Button
          title="Review appointment"
          disabled={!selectedSlot || doctor.consultationFee == null}
          onPress={onReview}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  doctorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  doctorInfo: {
    flex: 1,
    gap: 2,
  },
  doctorName: {
    ...typography.title,
  },
  doctorMeta: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  feeLabel: {
    ...typography.body,
  },
  feeValue: {
    ...typography.bodyBold,
  },
  feeTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xxs,
  },
  feeTotalLabel: {
    ...typography.title,
  },
  feeTotalValue: {
    ...typography.title,
    color: colors.primaryDark,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  headerTitle: {
    ...typography.bodyBold,
  },
  dateList: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  dateItem: {
    width: 58,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    gap: 2,
  },
  dateItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateDay: {
    ...typography.caption,
    color: colors.textMuted,
  },
  dateDayActive: {
    color: colors.white,
  },
  dateNum: {
    ...typography.title,
  },
  dateNumActive: {
    color: colors.white,
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  fixedType: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.mint,
  },
  fixedTypeText: {
    ...typography.caption,
    color: colors.primaryDark,
  },
  slotsLoading: {
    marginVertical: spacing.lg,
  },
  inlineError: {
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  shiftBlock: {
    gap: spacing.xs,
  },
  shiftTitle: {
    ...typography.label,
    color: colors.textMuted,
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  slotItem: {
    minWidth: 92,
    minHeight: sizes.touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  slotItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotText: {
    ...typography.caption,
    color: colors.text,
  },
  slotTextActive: {
    color: colors.white,
    fontWeight: "600",
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  summary: {
    ...typography.caption,
    color: colors.text,
    textAlign: "center",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
