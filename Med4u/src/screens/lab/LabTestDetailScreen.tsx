import React, { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarDays, Clock3 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { Input } from "../../components/ui/Input";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { toApiError } from "../../services/api/errors";
import { CreateLabBooking, labService } from "../../services/lab.service";
import { useAuthStore } from "../../store/authStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { clinicDayOfMonth, clinicWeekday, formatClinicTime, formatCurrency } from "../../utils/helpers";
import { formatLabDate, isSlotInFuture, LAB_BOOKING_DAYS, LAB_TIME_SLOTS, upcomingDates, validateLabBooking } from "../../utils/lab";

type Props = NativeStackScreenProps<MainStackParamList, "LabTestDetail">;

const SHIFTS = [
  { label: "Morning", matches: (hour: number) => hour < 12 },
  { label: "Afternoon", matches: (hour: number) => hour >= 12 && hour < 17 },
  { label: "Evening", matches: (hour: number) => hour >= 17 },
] as const;

export function LabTestDetailScreen({ navigation, route }: Props) {
  const { test } = route.params;
  const user = useAuthStore((s) => s.user);
  const dates = useMemo(() => upcomingDates(LAB_BOOKING_DAYS), []);
  const [date, setDate] = useState(dates[0]);
  const [time, setTime] = useState("");
  // Slots already past today are not offered, as in appointment booking.
  const slots = useMemo(() => LAB_TIME_SLOTS.filter((t) => isSlotInFuture(date, t)), [date]);
  const [homeCollection, setHomeCollection] = useState(false);
  const [contactName, setContactName] = useState(user?.name ?? "");
  const [contactPhone, setContactPhone] = useState(user?.phone ?? "");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problem = validateLabBooking({ date, time, homeCollection, contactName, contactPhone, addressLine, city, state, pincode });
    if (problem) { setError(problem); return; }
    // Only what the patient chose is sent. Price, status and ownership are decided by the server.
    const request: CreateLabBooking = {
      testId: test.id,
      preferredDate: date,
      preferredTime: time,
      homeCollection,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      ...(homeCollection ? { address: { line1: addressLine.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim() } } : {}),
    };
    setSubmitting(true); setError(null);
    try {
      const booking = await labService.book(request);
      navigation.replace("LabBookingConfirmation", { booking });
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">{test.name}</Text>
              <Text style={styles.meta}>{test.category}</Text>
            </View>
            {test.isDemo ? <StatusBadge label="Demo listing" tone="info" /> : null}
          </View>
          {test.description ? <Text style={styles.body}>{test.description}</Text> : null}
          <Fact label="Sample" value={test.sampleType} />
          <Fact label="Preparation" value={test.preparationInstructions} />
          <Fact label="Report" value={test.turnaroundDays > 0 ? `About ${test.turnaroundDays} ${test.turnaroundDays === 1 ? "day" : "days"}` : ""} />
          <Fact label="Lab" value={test.labLocation} />
          {test.isDemo ? <Text style={styles.notice}>Demo listing. Booking it records a request only; no laboratory appointment is made and nothing is charged.</Text> : null}
        </Card>

        <Text style={styles.notice}>Choose a preferred collection date and time. The lab must confirm availability; this request does not reserve a slot.</Text>

        <Card style={styles.card}>
          <Text style={styles.section} accessibilityRole="header">Collection method</Text>
          <View style={styles.chips}>
            <CategoryChip label="Visit lab" selected={!homeCollection} onPress={() => setHomeCollection(false)} />
            {test.homeCollectionAvailable ? <CategoryChip label="Home collection" selected={homeCollection} onPress={() => setHomeCollection(true)} /> : null}
          </View>
          {!test.homeCollectionAvailable ? <Text style={styles.meta}>Home collection is not available for this test.</Text> : null}
          {homeCollection ? (
            <View style={styles.gap}>
              <Input label="Address" value={addressLine} onChangeText={setAddressLine} placeholder="Street address" maxLength={120} />
              <Input label="City" value={city} onChangeText={setCity} placeholder="City" maxLength={80} />
              <Input label="State" value={state} onChangeText={setState} placeholder="State" maxLength={80} />
              <Input label="PIN code" value={pincode} onChangeText={setPincode} placeholder="6-digit PIN code" keyboardType="number-pad" maxLength={6} />
            </View>
          ) : null}
        </Card>

        <View style={styles.headerRow}>
          <CalendarDays size={iconSizes.md} color={colors.primaryDark} />
          <Text style={styles.headerTitle} accessibilityRole="header">Preferred date</Text>
        </View>
        <FlatList
          horizontal
          data={dates}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateList}
          renderItem={({ item }) => {
            const active = date === item;
            return (
              <Pressable
                onPress={() => { setDate(item); setTime(""); }}
                style={[styles.dateItem, active && styles.itemActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatLabDate(item)}
              >
                <Text style={[styles.dateDay, active && styles.textActive]}>{clinicWeekday(item)}</Text>
                <Text style={[styles.dateNum, active && styles.textActive]}>{clinicDayOfMonth(item)}</Text>
              </Pressable>
            );
          }}
        />

        <View style={styles.headerRow}>
          <Clock3 size={iconSizes.md} color={colors.primaryDark} />
          <Text style={styles.headerTitle} accessibilityRole="header">Preferred time</Text>
        </View>
        {slots.length === 0 ? (
          <Text style={styles.meta}>No time slots left on this day. Try another date.</Text>
        ) : SHIFTS.map((shift) => {
          const shiftSlots = slots.filter((t) => shift.matches(Number(t.slice(0, 2))));
          if (shiftSlots.length === 0) return null;
          return (
            <View key={shift.label} style={styles.gap}>
              <Text style={styles.shiftTitle}>{shift.label}</Text>
              <View style={styles.wrap}>
                {shiftSlots.map((t) => {
                  const active = time === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTime(t)}
                      style={[styles.slotItem, active && styles.itemActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatClinicTime(t)}, available`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.slotText, active && styles.slotTextActive]}>{formatClinicTime(t)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        {time ? <Text style={styles.summaryLine}>{formatLabDate(date)} · {formatClinicTime(time)} · {homeCollection ? "Home collection" : "Visit lab"}</Text> : null}

        <Card style={styles.card}>
          <Text style={styles.section} accessibilityRole="header">Patient details</Text>
          <Input label="Patient name" value={contactName} onChangeText={setContactName} placeholder="Full name" maxLength={100} autoCapitalize="words" />
          <Input label="Contact phone" value={contactPhone} onChangeText={setContactPhone} placeholder="Phone number" keyboardType="phone-pad" maxLength={20} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section} accessibilityRole="header">Booking summary</Text>
          <Row label={test.name} value={formatCurrency(test.price)} />
          <View style={styles.divider} />
          <Row label="Total" value={formatCurrency(test.price)} strong />
          <Text style={styles.meta}>The server confirms the final price when the booking is created. No payment is taken in the app.</Text>
        </Card>

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Button title="Confirm booking" loading={submitting} onPress={() => void submit()} />
      </ScrollView>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <Text style={styles.body}><Text style={styles.label}>{label}: </Text>{value}</Text>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.flex, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.body, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  title: { ...typography.h3, color: colors.text },
  section: { ...typography.title, fontWeight: "500", color: colors.primaryDark },
  meta: { ...typography.caption, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  label: { fontWeight: "700", color: colors.primaryDark },
  notice: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningLight, padding: spacing.sm, borderRadius: radius.sm },
  chips: { flexDirection: "row", gap: spacing.xs, paddingVertical: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  gap: { gap: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  strong: { fontWeight: "700" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  headerTitle: { ...typography.bodyBold },
  dateList: { gap: spacing.xs, paddingVertical: spacing.xs },
  dateItem: { width: 58, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", gap: 2 },
  dateDay: { ...typography.caption, color: colors.textMuted },
  dateNum: { ...typography.title },
  itemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  textActive: { color: colors.white },
  shiftTitle: { ...typography.label, color: colors.textMuted },
  slotItem: { minWidth: 92, minHeight: sizes.touchTarget, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  slotText: { ...typography.caption, color: colors.text },
  slotTextActive: { color: colors.white, fontWeight: "600" },
  summaryLine: { ...typography.caption, color: colors.text, textAlign: "center" },
  divider: { height: 1, backgroundColor: colors.border },
  error: { ...typography.body, color: colors.danger },
});
