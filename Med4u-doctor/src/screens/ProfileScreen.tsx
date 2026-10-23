import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronRight, Clock3, FileText, Settings, UserRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Page, PreviewLabel, TopBar } from "../components/ui";
import { MOCK_DOCTOR } from "../data/mockData";
import { DoctorStackParamList } from "../types/navigation";
import { colors, round, space, type } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  return (
    <Page activeTab="Profile">
      <TopBar title="Profile" />
      <PreviewLabel />
      <Card style={styles.profileCard}>
        <View style={styles.avatar}><UserRound size={27} color={colors.forest} /></View>
        <Text style={styles.name}>{MOCK_DOCTOR.name}</Text>
        <Text style={styles.specialty}>{MOCK_DOCTOR.specialty}</Text>
        <Text style={styles.clinic}>{MOCK_DOCTOR.clinic}</Text>
      </Card>
      <Card style={styles.menuCard}>
        <MenuRow icon={UserRound} title="Professional details" subtitle="Contact and registration" onPress={() => navigation.navigate("Settings")} />
        <MenuRow icon={Clock3} title="Availability" subtitle="Weekly clinic schedule" onPress={() => navigation.navigate("Availability")} />
        <MenuRow icon={FileText} title="Consultation history" subtitle="Previous visits and prescriptions" onPress={() => navigation.navigate("History")} />
        <MenuRow icon={Settings} title="Settings" subtitle="Preferences and app information" onPress={() => navigation.navigate("Settings")} />
      </Card>
      <Text style={styles.caption}>Profile information is sample data for this preview.</Text>
    </Page>
  );
}

function MenuRow({ icon: Icon, title, subtitle, onPress }: { icon: typeof UserRound; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.menuIcon}><Icon size={18} color={colors.forest} /></View>
      <View style={styles.menuText}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.caption}>{subtitle}</Text></View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileCard: { alignItems: "center", paddingVertical: space.xl },
  avatar: { width: 70, height: 70, alignItems: "center", justifyContent: "center", borderRadius: 35, backgroundColor: colors.sageLight },
  name: { ...type.title, fontSize: 20, color: colors.forest },
  specialty: { ...type.body, fontWeight: "600" },
  clinic: { ...type.caption },
  menuCard: { paddingVertical: 0 },
  menuRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.sageLight },
  menuText: { flex: 1, gap: 2 },
  menuTitle: { ...type.label },
  caption: { ...type.caption },
  pressed: { opacity: 0.7 },
});
