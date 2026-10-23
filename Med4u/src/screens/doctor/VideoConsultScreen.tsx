import React from "react";
import { StyleSheet, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { VideoCall } from "../../components/video/VideoCall";
import { ErrorState } from "../../components/ui/ErrorState";
import { Loader } from "../../components/ui/Loader";
import { useAsyncData } from "../../hooks/useAsyncData";
import { appointmentService } from "../../services/appointment.service";
import { consultationService } from "../../services/consultation.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "VideoConsult">;

export function VideoConsultScreen({ route, navigation }: Props) {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const appointment = await appointmentService.get(route.params.appointmentId);
    if (!appointment.canJoin || appointment.type !== "video") {
      throw new Error("This video appointment is not currently open for joining.");
    }
    const credentials = await consultationService.join(appointment.id);
    return { appointment, credentials };
  }, [route.params.appointmentId]);

  if (loading) return <Loader />;

  if (error || !data) {
    return (
      <ErrorState
        title="Consultation unavailable"
        message={error ?? "This appointment is no longer available."}
        onRetry={reload}
      />
    );
  }

  const displayName = data.appointment.patient?.name ?? data.appointment.doctor.name;
  return (
    <View style={styles.container}>
      <VideoCall
        appointmentId={data.appointment.id}
        displayName={displayName}
        doctorName={data.appointment.doctor.name}
        doctorSpecialization={data.appointment.doctor.specialization}
        doctorId={data.appointment.doctor.id}
        doctorAvatarUrl={data.appointment.doctor.avatarUrl}
        doctorGender={data.appointment.doctor.gender}
        doctorIsDemo={data.appointment.doctor.isDemo}
        isPatient={!data.appointment.patient}
        credentials={data.credentials}
        onExit={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#07130f" },
});
