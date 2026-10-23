import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CalendarDays, CheckCircle2, Clock3, FileText, UserRound } from "lucide-react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { Notice } from "../components/formControls";
import { ErrorCard } from "../dashboard/DashboardView";
import { formatClock } from "../dashboard/dashboardModel";
import { toDoctorApiError } from "../api/client";
import { appointmentApi } from "../services/appointmentApi";
import { prescriptionApi } from "../services/prescriptionApi";
import { ApiAppointment, ApiAppointmentStatus } from "../types/appointment";
import { AppointmentPrescriptionState } from "../types/prescription";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space, type } from "../theme/tokens";
import { formatDate } from "../components/PrescriptionDocument";

type Props = NativeStackScreenProps<DoctorStackParamList, "ConsultationSummary">;
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; appointment: ApiAppointment; rx: AppointmentPrescriptionState };

const STATUS_TEXT: Record<ApiAppointmentStatus, string> = {
  completed: "Consultation completed",
  confirmed: "Not completed yet",
  pending: "Not completed yet",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

/**
 * Shown after a call ends (and reachable later from the appointment). Everything on it comes from the server:
 * the prescription actions appear only when the server reports the consultation as genuinely completed.
 */
export function ConsultationSummaryScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [appointment, rx] = await Promise.all([appointmentApi.get(appointmentId), prescriptionApi.state(appointmentId)]);
      if (alive.current) setState({ status: "ready", appointment, rx });
    } catch (error) {
      if (alive.current) setState({ status: "error", message: toDoctorApiError(error).message });
    }
  }, [appointmentId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Page>
      <TopBar title="Consultation summary" />
      {state.status === "loading" ? (
        <View style={styles.center} accessibilityState={{ busy: true }}><ActivityIndicator color={colors.green} /></View>
      ) : state.status === "error" ? (
        <ErrorCard title="Couldn't load the consultation" message={state.message} onRetry={() => { void load(); }} />
      ) : (
        <Ready state={state} appointmentId={appointmentId} navigation={navigation} reload={load} />
      )}
    </Page>
  );
}

function Ready({
  state,
  appointmentId,
  navigation,
  reload,
}: {
  state: Extract<LoadState, { status: "ready" }>;
  appointmentId: string;
  navigation: Props["navigation"];
  reload: () => Promise<void>;
}) {
  const { appointment, rx } = state;
  const completed = appointment.status === "completed";
  return (
    <>
      <Card>
        <Row icon={UserRound} label="Patient" value={appointment.patient?.name?.trim() || "Patient"} />
        <Row icon={CalendarDays} label="Appointment date" value={formatDate(appointment.date)} />
        <Row icon={Clock3} label="Time" value={`${formatClock(appointment.startTime)} – ${formatClock(appointment.endTime)}`} />
        <Row icon={CheckCircle2} label="Consultation status" value={STATUS_TEXT[appointment.status]} />
        <Row
          icon={FileText}
          label="Prescription"
          value={rx.issued ? `Issued · ${rx.issued.reference}` : rx.draft ? "Draft in progress (not visible to the patient)" : "Not written"}
        />
      </Card>

      {!completed ? (
        <Notice tone="warning">
          The consultation has not ended yet, or the call never connected, so a prescription cannot be written. If you just finished the call, refresh in a moment.
        </Notice>
      ) : !rx.eligibility.canPrescribe ? (
        <Notice tone="warning">{rx.eligibility.message ?? "A prescription cannot be written for this consultation."}</Notice>
      ) : null}

      {rx.issued ? (
        <ActionButton label="View Prescription" onPress={() => navigation.navigate("PrescriptionDetail", { prescriptionId: rx.issued!.id, appointmentId })} />
      ) : null}
      {rx.eligibility.canPrescribe && !rx.issued ? (
        <ActionButton label={rx.draft ? "Continue prescription" : "Add Prescription"} onPress={() => navigation.navigate("PrescriptionEditor", { appointmentId })} />
      ) : null}
      {!completed ? <ActionButton label="Refresh status" secondary onPress={() => { void reload(); }} /> : null}
      <ActionButton label="Back to appointments" secondary onPress={() => navigation.reset({ index: 0, routes: [{ name: "Appointments" }] })} />
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon size={18} color={colors.green} />
      <View style={styles.rowText}><Text style={type.caption}>{label}</Text><Text style={type.body}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxl, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowText: { flex: 1, gap: 1 },
});
