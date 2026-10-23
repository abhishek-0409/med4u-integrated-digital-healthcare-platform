import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Clock, Inbox, TestTube2 } from "lucide-react-native";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { SearchBar } from "../../components/ui/SearchBar";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { toApiError } from "../../services/api/errors";
import { labService } from "../../services/lab.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { LabBooking, LabTest } from "../../types/lab";
import { MainStackParamList } from "../../types/navigation";
import { formatCurrency } from "../../utils/helpers";
import { filterLabTests, formatLabDate, splitBookings } from "../../utils/lab";

type Props = NativeStackScreenProps<MainStackParamList, "BookTest">;

const ALL = "All tests";
export const labStatusTone = (status: LabBooking["status"]) => {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "neutral" as const;
  if (status === "pending") return "warning" as const;
  return "info" as const;
};

export function BookTestScreen({ navigation, route }: Props) {
  const [tests, setTests] = useState<LabTest[]>([]);
  const [bookings, setBookings] = useState<LabBooking[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    // The catalog is the page; a failing booking history must not hide it.
    const [catalog, history] = await Promise.allSettled([labService.catalog(), labService.bookings()]);
    if (catalog.status === "fulfilled") setTests(catalog.value); else setError(toApiError(catalog.reason).message);
    if (history.status === "fulfilled") { setBookings(history.value); setBookingsError(null); }
    else setBookingsError(toApiError(history.reason).message);
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Pick up a booking made on the details screen, or a status change, when returning here.
  useEffect(() => navigation.addListener("focus", () => { void load(true); }), [navigation, load]);

  const categories = useMemo(() => [ALL, ...Array.from(new Set(tests.map((t) => t.category).filter(Boolean)))], [tests]);
  const visible = useMemo(() => {
    const filtered = filterLabTests(tests, query, category, ALL);
    const ids = new Set(route.params?.recommendedTestIds ?? []);
    return [...filtered].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)));
  }, [tests, query, category, route.params?.recommendedTestIds]);
  const { upcoming, previous } = useMemo(() => splitBookings(bookings), [bookings]);
  const openBooking = (booking: LabBooking) => navigation.navigate("LabBookingConfirmation", { booking });

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <Text style={styles.heading} accessibilityRole="header">Book Lab Tests</Text>
        {route.params?.recommendedTestIds?.length ? <Text style={styles.meta}>Exact catalog matches for the doctor's recommendations are shown first. A recommendation without a current catalog match cannot be booked here; contact support. Each booking is a request, and the lab confirms availability.</Text> : null}
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by test name" accessibilityLabel="Search lab tests" style={styles.searchBar} />
        {!loading && categories.length > 2 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((item) => <CategoryChip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />)}
          </ScrollView>
        ) : null}

        {loading ? <LoadingSkeleton count={3} /> : error ? (
          <ErrorState title="Couldn't load lab tests" message={error} onRetry={() => void load()} />
        ) : !visible.length ? (
          <EmptyBlock
            title={tests.length ? "No matching tests" : "No lab tests available"}
            message={tests.length ? "Try another search or category." : "The catalog is empty right now. Please check again later."}
          />
        ) : visible.map((test) => (
          <Card key={test.id} style={styles.testCard}>
            <View style={styles.testTop}>
              <View style={styles.testIcon}><TestTube2 size={iconSizes.lg} color={colors.primaryDark} /></View>
              <View style={styles.flex}>
                <Text style={styles.testName}>{test.name}</Text>
                <Text style={styles.meta}>{test.category}</Text>
              </View>
              {test.isDemo ? <StatusBadge label="Demo listing" tone="info" /> : null}
            </View>
            {test.description ? <Text style={styles.body} numberOfLines={3}>{test.description}</Text> : null}
            <View style={styles.facts}>
              {test.sampleType ? <Text style={styles.meta}>Sample: {test.sampleType}</Text> : null}
              {test.turnaroundDays > 0 ? <Text style={styles.meta}>Report in about {test.turnaroundDays} {test.turnaroundDays === 1 ? "day" : "days"}</Text> : null}
              {test.preparationInstructions ? <Text style={styles.meta} numberOfLines={2}>Preparation: {test.preparationInstructions}</Text> : null}
            </View>
            <View style={styles.testBottom}>
              <Text style={styles.price}>{formatCurrency(test.price)}</Text>
              <Button title="Book Test" size="sm" fullWidth={false} accessibilityLabel={`Book ${test.name}`} onPress={() => navigation.navigate("LabTestDetail", { test })} />
            </View>
          </Card>
        ))}

        <Text style={styles.sectionTitle} accessibilityRole="header">Your lab bookings</Text>
        {bookingsError ? (
          <ErrorState title="Couldn't load your bookings" message={bookingsError} onRetry={() => void load()} />
        ) : loading && !bookings.length ? <LoadingSkeleton count={1} /> : !bookings.length ? (
          <EmptyBlock title="No bookings yet" message="Tests you book will appear here." />
        ) : (
          <>
            {upcoming.length ? <Text style={styles.groupTitle}>Upcoming</Text> : null}
            {upcoming.map((b) => <BookingRow key={b.id} booking={b} onPress={() => openBooking(b)} />)}
            {previous.length ? <Text style={styles.groupTitle}>Previous</Text> : null}
            {previous.map((b) => <BookingRow key={b.id} booking={b} onPress={() => openBooking(b)} />)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BookingRow({ booking, onPress }: { booking: LabBooking; onPress: () => void }) {
  const status = booking.status.replaceAll("_", " ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.test.name}, ${status}, ${booking.preferredDate} at ${booking.preferredTime}. View booking.`}
    >
      <Card style={styles.bookingCard}>
        <View style={styles.testTop}>
          <View style={styles.flex}>
            <Text style={styles.testName}>{booking.test.name}</Text>
            <View style={styles.row}>
              <Clock size={iconSizes.xs} color={colors.textMuted} />
              <Text style={styles.meta}>{formatLabDate(booking.preferredDate)} · {booking.preferredTime}</Text>
            </View>
            <Text style={styles.meta}>{booking.reference} · {formatCurrency(booking.priceSnapshot)}</Text>
          </View>
          <StatusBadge label={status} tone={labStatusTone(booking.status)} />
        </View>
      </Card>
    </Pressable>
  );
}

function EmptyBlock({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.emptyState} accessibilityLabel={`${title}. ${message}`}>
      <View style={styles.emptyIcon}><Inbox size={iconSizes.md} color={colors.primaryDark} /></View>
      <View style={styles.flex}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.meta}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  heading: { ...typography.h2, color: colors.text },
  searchBar: { borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card },
  chips: { gap: spacing.xs, paddingVertical: 2 },
  sectionTitle: { ...typography.title, fontWeight: "500", color: colors.primaryDark, marginTop: spacing.sm },
  groupTitle: { ...typography.label, color: colors.textMuted },
  testCard: { gap: spacing.sm },
  testTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  testIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: spacing.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  testName: { ...typography.bodyBold, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  facts: { gap: spacing.xxs },
  testBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  price: { ...typography.h3, color: colors.primaryDark },
  bookingCard: { gap: spacing.xs },
  emptyState: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  emptyIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  emptyTitle: { ...typography.bodyBold, fontWeight: "500", color: colors.text },
});
