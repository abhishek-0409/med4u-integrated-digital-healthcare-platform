import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CalendarDays, Clock3, MapPin, UserRound, Video } from "lucide-react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { ErrorCard, StatusPill } from "../dashboard/DashboardView";
import { clinicDate, DashboardAppointment, formatClock, toDashboardAppointment } from "../dashboard/dashboardModel";
import { toDoctorApiError } from "../api/client";
import { appointmentApi } from "../services/appointmentApi";
import { prescriptionApi } from "../services/prescriptionApi";
import { AppointmentPrescriptionState } from "../types/prescription";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space, type } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "AppointmentDetail">;
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; appointment: DashboardAppointment; endLabel: string; notes: string | null; rx: AppointmentPrescriptionState | null };

export function AppointmentDetailScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const a = await appointmentApi.get(appointmentId);
      // Prescription status is best-effort here: the appointment must still open if it cannot be loaded.
      const rx = a.status === "completed" ? await prescriptionApi.state(appointmentId).catch(() => null) : null;
      if (alive.current) setState({ status: "ready", appointment: toDashboardAppointment(a, clinicDate(new Date())), endLabel: formatClock(a.endTime), notes: a.notes, rx });
    } catch (error) {
      if (alive.current) setState({ status: "error", message: toDoctorApiError(error).message });
    }
  }, [appointmentId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Page>
      <TopBar title="Appointment details" back />
      {state.status === "loading" ? (
        <View style={styles.center} accessibilityState={{ busy: true }}><ActivityIndicator color={colors.green} /></View>
      ) : state.status === "error" ? (
        <ErrorCard title="Couldn't load this appointment" message={state.message} onRetry={() => { void load(); }} />
      ) : (
        <>
          <Card style={styles.hero}>
            <View style={styles.avatar}><UserRound size={26} color={colors.forest} /></View>
            <Text style={styles.patient}>{state.appointment.patientName}</Text>
            <StatusPill status={state.appointment.status} label={state.appointment.statusLabel} />
          </Card>
          <Card>
            <Detail icon={CalendarDays} label="Date" value={state.appointment.dayLabel === "Today" || state.appointment.dayLabel === "Tomorrow" ? `${state.appointment.dayLabel} (${state.appointment.date})` : state.appointment.date} />
            <Detail icon={Clock3} label="Time" value={`${state.appointment.timeLabel} – ${state.endLabel}`} />
            <Detail icon={state.appointment.type === "video" ? Video : MapPin} label="Consultation type" value={state.appointment.typeLabel} />
          </Card>
          {state.notes ? <Card><Text style={styles.label}>Booking note</Text><Text style={styles.copy}>{state.notes}</Text></Card> : null}
          {state.appointment.canJoin ? (
            <ActionButton label="Join consultation" onPress={() => navigation.navigate("VideoConsult", { appointmentId })} />
          ) : null}
          {state.appointment.status === "completed" ? (
            <>
              {state.rx?.issued ? (
                <ActionButton label="View Prescription" onPress={() => navigation.navigate("PrescriptionDetail", { prescriptionId: state.rx!.issued!.id, appointmentId })} />
              ) : (
                <ActionButton label={state.rx?.draft ? "Continue prescription" : "Add Prescription"} onPress={() => navigation.navigate("PrescriptionEditor", { appointmentId })} />
              )}
              <ActionButton label="Consultation summary" secondary onPress={() => navigation.navigate("ConsultationSummary", { appointmentId })} />
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <View style={styles.detail}><Icon size={18} color={colors.green} /><View style={styles.detailText}><Text style={styles.caption}>{label}</Text><Text style={styles.copy}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxl, alignItems: "center" },
  hero: { alignItems: "center", paddingVertical: space.xl },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: colors.sageLight },
  patient: { ...type.title, color: colors.forest, textAlign: "center" },
  copy: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.label },
  detail: { flexDirection: "row", alignItems: "center", gap: space.sm },
  detailText: { flex: 1, gap: 1 },
});
