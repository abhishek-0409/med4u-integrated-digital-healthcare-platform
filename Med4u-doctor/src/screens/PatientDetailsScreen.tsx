import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AlertCircle, FileText, Phone, UserRound } from "lucide-react-native";
import { Card, Page, PreviewLabel, TopBar } from "../components/ui";
import { appointmentState } from "../state/appointmentState";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space, type } from "../theme/tokens";
import { StyleSheet, Text, View } from "react-native";

type Props = NativeStackScreenProps<DoctorStackParamList, "PatientDetails">;

export function PatientDetailsScreen({ route }: Props) {
  const appointment = appointmentState.byId(route.params.appointmentId);
  if (!appointment) return <Page><TopBar title="Patient details" back /><Text style={styles.body}>Sample patient details unavailable.</Text></Page>;
  return (
    <Page>
      <TopBar title="Patient consultation" back />
      <PreviewLabel />
      <Card style={styles.patientCard}>
        <View style={styles.avatar}><UserRound size={24} color={colors.forest} /></View>
        <View style={styles.flex}><Text style={styles.patient}>{appointment.patientName}</Text><Text style={styles.body}>{appointment.age} years · {appointment.gender}</Text></View>
      </Card>
      <Card>
        <InfoRow icon={Phone} label="Contact" value={appointment.phone} />
        <InfoRow icon={FileText} label="Reason for visit" value={appointment.reason} />
      </Card>
      <Card style={styles.notice}>
        <AlertCircle size={19} color={colors.green} />
        <View style={styles.flex}>
          <Text style={styles.noticeTitle}>Patient record preview</Text>
          <Text style={styles.body}>{appointment.notes} Medical history and records will appear here after secure API integration.</Text>
        </View>
      </Card>
    </Page>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return <View style={styles.infoRow}><Icon size={18} color={colors.green} /><View style={styles.flex}><Text style={styles.label}>{label}</Text><Text style={styles.body}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  patientCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.sageLight },
  flex: { flex: 1, gap: 3 },
  patient: { ...type.title, color: colors.forest },
  body: { ...type.body, color: colors.muted },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  label: { ...type.caption, color: colors.muted },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: colors.sageLight, borderColor: colors.sageLight },
  noticeTitle: { ...type.label, color: colors.forest },
});
