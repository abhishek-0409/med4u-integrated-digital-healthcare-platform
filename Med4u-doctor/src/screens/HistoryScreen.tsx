import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ClipboardList, FileText } from "lucide-react-native";
import { Card, Page, PreviewLabel, SectionTitle, TopBar } from "../components/ui";
import { MOCK_HISTORY } from "../data/mockData";
import { colors, space, type } from "../theme/tokens";

const MOCK_PRESCRIPTIONS = [
  { id: "rx-1", patient: "Neha Iyer", medicine: "Sample prescription", date: "12 Oct 2026", status: "Draft preview" },
  { id: "rx-2", patient: "Vikram Joshi", medicine: "Sample prescription", date: "10 Oct 2026", status: "Draft preview" },
];

export function HistoryScreen() {
  return (
    <Page>
      <TopBar title="History & prescriptions" back />
      <PreviewLabel />
      <SectionTitle title="Consultation history" />
      <Card>
        {MOCK_HISTORY.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.icon}><ClipboardList size={18} color={colors.forest} /></View>
            <View style={styles.details}><Text style={styles.name}>{item.patient}</Text><Text style={styles.detail}>{item.detail}</Text></View>
            <Text style={styles.date}>{item.date}</Text>
          </View>
        ))}
      </Card>
      <SectionTitle title="Prescriptions" />
      <Card>
        {MOCK_PRESCRIPTIONS.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.icon}><FileText size={18} color={colors.forest} /></View>
            <View style={styles.details}><Text style={styles.name}>{item.patient}</Text><Text style={styles.detail}>{item.medicine} · {item.status}</Text></View>
            <Text style={styles.date}>{item.date}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.disclaimer}>Sample records only. Prescription creation and patient history APIs are not connected.</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.sageLight },
  details: { flex: 1, gap: 3 },
  name: { ...type.label },
  detail: { ...type.caption },
  date: { fontSize: 11, color: colors.muted },
  disclaimer: { ...type.caption, textAlign: "center" },
});
