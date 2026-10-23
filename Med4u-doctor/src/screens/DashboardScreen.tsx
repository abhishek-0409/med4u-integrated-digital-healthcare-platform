import React, { useMemo } from "react";
import { RefreshControl } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Page } from "../components/ui";
import { useAuth } from "../auth/authContext";
import { DashboardActions, DashboardView } from "../dashboard/DashboardView";
import { displayDoctorName } from "../dashboard/dashboardModel";
import { useDashboard } from "../dashboard/useDashboard";
import { DoctorStackParamList } from "../types/navigation";
import { colors } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "Dashboard">;

export function DashboardScreen({ navigation }: Props) {
  const { session } = useAuth();
  const doctor = session && session.kind !== "applicant" ? session.doctor : null;
  const doctorId = doctor?.id ?? "";
  const { result, loading, refreshing, refresh } = useDashboard(doctorId);

  const actions = useMemo<DashboardActions>(() => ({
    openAppointment: (appointmentId) => navigation.navigate("AppointmentDetail", { appointmentId }),
    joinAppointment: (appointmentId) => navigation.navigate("VideoConsult", { appointmentId }),
    openAppointments: (filter) => navigation.navigate("Appointments", { filter }),
    openAvailability: () => navigation.navigate("Availability"),
    openHistory: () => navigation.navigate("History"),
    openProfile: () => navigation.navigate("Profile"),
    retry: () => { void refresh(); },
  }), [navigation, refresh]);

  const name = displayDoctorName(doctor?.name ?? session?.user.name);
  return (
    <Page
      activeTab="Dashboard"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={colors.green} colors={[colors.green]} />}
    >
      <DashboardView doctorName={name} avatarUrl={session?.user.avatarUrl ?? null} loading={loading} result={result} actions={actions} />
    </Page>
  );
}
