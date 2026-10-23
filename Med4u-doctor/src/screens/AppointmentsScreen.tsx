import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ChevronRight, MapPin, Video } from "lucide-react-native";
import { Page, TopBar } from "../components/ui";
import { ErrorCard, StatusPill } from "../dashboard/DashboardView";
import { clinicDate, DashboardAppointment, toDashboardAppointment } from "../dashboard/dashboardModel";
import { toDoctorApiError } from "../api/client";
import { appointmentApi } from "../services/appointmentApi";
import { DoctorStackParamList } from "../types/navigation";
import { colors, round, space, type } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "Appointments">;
type Filter = "upcoming" | "pending";
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: DashboardAppointment[]; total: number };

export function AppointmentsScreen({ navigation, route }: Props) {
  const [filter, setFilter] = useState<Filter>(route.params?.filter ?? "upcoming");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (route.params?.filter) setFilter(route.params.filter); }, [route.params?.filter]);

  const load = useCallback(async () => {
    try {
      const page = await appointmentApi.list({ scope: "upcoming", limit: 50 });
      const today = clinicDate(new Date());
      const items = page.items.map((a) => toDashboardAppointment(a, today)).sort((a, b) => a.startMs - b.startMs);
      if (alive.current) setState({ status: "ready", items, total: page.total });
    } catch (error) {
      if (alive.current) setState({ status: "error", message: toDoctorApiError(error).message });
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const items = state.status === "ready" ? (filter === "pending" ? state.items.filter((a) => a.status === "pending") : state.items) : [];
  const pendingCount = state.status === "ready" ? state.items.filter((a) => a.status === "pending").length : undefined;
  return (
    <Page
      activeTab="Appointments"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.green} colors={[colors.green]} />}
    >
      <TopBar title="Appointments" />
      <View style={styles.filters}>
        <FilterButton label="Upcoming" selected={filter === "upcoming"} onPress={() => setFilter("upcoming")} />
        <FilterButton label="Pending" count={pendingCount} selected={filter === "pending"} onPress={() => setFilter("pending")} />
      </View>
      {state.status === "loading" ? (
        <View style={styles.list} accessibilityState={{ busy: true }} accessibilityLabel="Loading appointments">
          {[0, 1, 2].map((i) => <View key={i} style={[styles.row, i > 0 && styles.border]}><View style={styles.skel} /></View>)}
        </View>
      ) : state.status === "error" ? (
        <ErrorCard title="Couldn't load appointments" message={state.message} onRetry={() => { setState({ status: "loading" }); void load(); }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{filter === "pending" ? "No pending requests" : "No upcoming appointments"}</Text>
          <Text style={styles.emptyCopy}>{filter === "pending" ? "Requests that need your review will appear here." : "New bookings will appear here."}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((a, index) => (
            <Pressable
              key={a.id}
              onPress={() => navigation.navigate("AppointmentDetail", { appointmentId: a.id })}
              accessibilityRole="button"
              accessibilityLabel={`${a.patientName}, ${a.dayLabel} ${a.timeLabel}, ${a.typeLabel}, ${a.statusLabel}. View details.`}
              style={({ pressed }) => [styles.row, index > 0 && styles.border, pressed && styles.pressed]}
            >
              <View style={styles.when}>
                <Text style={styles.day}>{a.dayLabel}</Text>
                <Text style={styles.time}>{a.timeLabel}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>{a.patientName}</Text>
                <View style={styles.meta}>
                  {a.type === "video" ? <Video size={13} color={colors.muted} /> : <MapPin size={13} color={colors.muted} />}
                  <Text style={styles.metaText}>{a.typeLabel}</Text>
                </View>
              </View>
              <StatusPill status={a.status} label={a.statusLabel} />
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>
          ))}
          {state.total > state.items.length ? <Text style={styles.more}>Showing the next {state.items.length} of {state.total} appointments.</Text> : null}
        </View>
      )}
    </Page>
  );
}

function FilterButton({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.filter, selected && styles.filterSelected]}>
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}{count !== undefined ? `  ${count}` : ""}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: space.xs, padding: 4, borderRadius: round.pill, backgroundColor: colors.cream },
  filter: { flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: round.pill },
  filterSelected: { backgroundColor: colors.forest },
  filterText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  filterTextSelected: { color: colors.card },
  list: { borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  when: { width: 66, gap: 1 },
  day: { fontSize: 11, color: colors.muted },
  time: { fontSize: 12, fontWeight: "600", color: colors.forest },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, lineHeight: 18, color: colors.muted },
  skel: { width: "70%", height: 14, borderRadius: 6, backgroundColor: colors.sageLight },
  empty: { alignItems: "center", gap: 4, padding: space.xl, borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  emptyCopy: { ...type.caption, textAlign: "center" },
  more: { ...type.caption, textAlign: "center", padding: space.sm },
  pressed: { opacity: 0.7 },
});
