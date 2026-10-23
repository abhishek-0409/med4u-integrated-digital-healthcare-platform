import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCircle2 } from "lucide-react-native";
import { AppointmentCard } from "../../components/doctor/AppointmentCard";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { usePaginatedData } from "../../hooks/usePaginatedData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { toApiError } from "../../services/api/errors";
import { appointmentService } from "../../services/appointment.service";
import { clinicalPrescriptionService } from "../../services/clinical-prescription.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { Appointment } from "../../types/appointment";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "Appointments">;
type Scope = "upcoming" | "past";

const PAGE_SIZE = 10;

const TABS: Array<{ value: Scope; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export function AppointmentsScreen({ navigation, route }: Props) {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const justBooked = Boolean(route.params?.bookedId);
  const [rxNotice, setRxNotice] = useState<string | null>(null);

  const openPrescription = async (appointment: Appointment) => {
    setRxNotice(null);
    try {
      const page = await clinicalPrescriptionService.list({ appointmentId: appointment.id, limit: 10 });
      // Show the currently valid prescription; fall back to the most recent record of any status.
      const current = page.items.find((rx) => rx.status === "issued") ?? page.items[0];
      if (current) navigation.navigate("PrescriptionDetail", { prescriptionId: current.id });
      else setRxNotice("Your doctor has not issued a prescription for this consultation yet. Pull down to refresh later.");
    } catch (err) {
      setRxNotice(`Couldn't check for a prescription: ${toApiError(err).message}`);
    }
  };

  const {
    items: appointments,
    loading,
    loadingMore,
    error,
    reload,
    loadMore,
  } = usePaginatedData(
    (page) => appointmentService.list({ scope, page, limit: PAGE_SIZE }),
    [scope],
  );

  // Statuses and join eligibility change server-side over time.
  useRefreshOnFocus(reload);

  const confirmCancel = (appointment: Appointment) => {
    setCancelError(null);
    setCancelTarget(appointment);
  };

  const cancel = async (appointment: Appointment) => {
    setCancellingId(appointment.id);
    setCancelError(null);
    try {
      await appointmentService.cancel(appointment.id);
      setCancelTarget(null);
    } catch (err) {
      setCancelError(toApiError(err).message);
    } finally {
      setCancellingId(null);
      reload();
    }
  };

  return (
    <View style={styles.container}>
      {justBooked ? (
        <View style={styles.banner}>
          <CheckCircle2 size={18} color={colors.primaryDark} />
          <Text style={styles.bannerText}>Your appointment is confirmed.</Text>
        </View>
      ) : null}

      {rxNotice ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>{rxNotice}</Text>
        </View>
      ) : null}

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = scope === tab.value;
          return (
            <Pressable
              key={tab.value}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setScope(tab.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && appointments.length === 0 ? (
        <ActivityIndicator style={styles.spinner} size="large" color={colors.primary} />
      ) : error && appointments.length === 0 ? (
        <ErrorState message={error} onRetry={reload} />
      ) : appointments.length === 0 ? (
        <EmptyState
          title={scope === "upcoming" ? "No upcoming appointments" : "No past appointments"}
          message={
            scope === "upcoming"
              ? "Book a doctor to see your appointments here."
              : "Completed and cancelled appointments appear here."
          }
          actionLabel={scope === "upcoming" ? "Find a doctor" : undefined}
          onAction={scope === "upcoming" ? () => navigation.navigate("DoctorList") : undefined}
        />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshing={loading}
          onRefresh={reload}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
          renderItem={({ item }) => (
            <AppointmentCard
              appointment={item}
              cancelling={cancellingId === item.id}
              onJoin={() => navigation.navigate("VideoConsult", { appointmentId: item.id })}
              onCancel={() => confirmCancel(item)}
              onViewPrescription={() => void openPrescription(item)}
            />
          )}
        />
      )}

      <ConfirmationDialog
        visible={cancelTarget !== null}
        title="Cancel appointment?"
        message={
          cancelTarget
            ? `Your appointment with ${cancelTarget.doctor.name} will be cancelled and the slot released.${
                cancelError ? `\n\nCouldn't cancel: ${cancelError}` : ""
              }`
            : cancelError ?? ""
        }
        confirmLabel="Cancel appointment"
        destructive
        loading={cancellingId !== null}
        onConfirm={() => {
          if (cancelTarget) void cancel(cancelTarget);
        }}
        onCancel={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
  },
  bannerText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.primaryDark,
  },
  tabText: {
    ...typography.caption,
    color: colors.text,
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: "600",
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  spinner: {
    marginTop: spacing.xl,
  },
  footer: {
    paddingVertical: spacing.md,
  },
});
