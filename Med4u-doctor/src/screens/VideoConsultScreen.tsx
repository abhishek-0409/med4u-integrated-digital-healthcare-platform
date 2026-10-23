import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { VideoConsultation } from "../components/VideoConsultation";
import { colors, round, space, type } from "../theme/tokens";
import { appointmentApi } from "../services/appointmentApi";
import {
  consultationApi,
  ConsultationCredentials,
} from "../services/consultationApi";
import { ApiAppointment } from "../types/appointment";
import { DoctorStackParamList } from "../types/navigation";

type Props = NativeStackScreenProps<DoctorStackParamList, "VideoConsult">;
type Ready = {
  appointment: ApiAppointment;
  credentials: ConsultationCredentials;
};

export function VideoConsultScreen({ route, navigation }: Props) {
  const [data, setData] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const appointment = await appointmentApi.get(route.params.appointmentId);
      if (
        !appointment.canJoin ||
        appointment.type !== "video" ||
        appointment.status !== "confirmed"
      ) {
        throw new Error(
          "This confirmed video appointment is not currently open for joining.",
        );
      }
      const credentials = await consultationApi.join(appointment.id);
      if (credentials.roomId !== appointment.id) {
        throw new Error("The consultation service returned a room for a different appointment.");
      }
      setData({ appointment, credentials });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The consultation could not be opened.",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [route.params.appointmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.green} />
        <Text style={type.body}>Authorizing consultation…</Text>
      </SafeAreaView>
    );
  if (error || !data)
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Consultation unavailable</Text>
        <Text style={type.body}>
          {error ?? "The appointment is no longer available."}
        </Text>
        <Pressable style={styles.button} onPress={() => void load()}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Return to appointment</Text>
        </Pressable>
      </SafeAreaView>
    );

  return (
    <VideoConsultation
      credentials={data.credentials}
      patientName={data.appointment.patient?.name ?? "Test patient"}
      // The call has ended (or failed): show the server-verified summary. Nothing opens automatically while a call is live.
      onExit={() => navigation.replace("ConsultationSummary", { appointmentId: data.appointment.id })}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.md,
    backgroundColor: colors.background,
  },
  errorTitle: { ...type.title, color: colors.forest },
  button: {
    padding: space.md,
    borderRadius: round.md,
    backgroundColor: colors.green,
  },
  buttonText: { ...type.label, color: colors.card },
  back: { ...type.body, color: colors.green },
});
