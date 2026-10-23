import React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { ActionButton, Card, Page, PreviewLabel, TopBar } from "../components/ui";
import { useAuth } from "../auth/authContext";
import { colors, space, type } from "../theme/tokens";

export function SettingsScreen() {
  const { logout, working } = useAuth();
  return (
    <Page>
      <TopBar title="Settings" back />
      <PreviewLabel text="PREVIEW SETTINGS" />
      <Card>
        <SettingRow icon={ShieldCheck} title="Privacy & security" detail="Secure account controls will be connected with doctor authentication." />
        <SettingRow icon={AlertCircle} title="Notifications" detail="Notification preferences are not connected yet." />
      </Card>
      <Card style={styles.appCard}>
        <Text style={styles.appName}>Med4U Doctor</Text>
        <Text style={styles.detail}>Version 1.0.0 · Foundation preview</Text>
        <Text style={styles.detail}>Terms and privacy links will be added with the production account flow.</Text>
      </Card>
      <ActionButton label={working ? "Signing out…" : "Sign out"} secondary onPress={() => void logout()} disabled={working} />
    </Page>
  );
}

function SettingRow({ icon: Icon, title, detail }: { icon: typeof ShieldCheck; title: string; detail: string }) {
  return <View style={styles.row}><View style={styles.icon}><Icon size={18} color={colors.forest} /></View><View style={styles.textWrap}><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text></View></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.sageLight },
  textWrap: { flex: 1, gap: 3 },
  title: { ...type.label },
  detail: { ...type.caption },
  appCard: { gap: 6, backgroundColor: colors.sageLight, borderColor: colors.sageLight },
  appName: { ...type.heading, color: colors.forest },
});
