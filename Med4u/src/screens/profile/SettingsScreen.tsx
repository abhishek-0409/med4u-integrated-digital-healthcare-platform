import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronRight, FileText, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react-native";
import appConfig from "../../../app.json";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { Screen } from "../../components/ui/Screen";
import { useAuth } from "../../hooks/useAuth";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "Settings">;
const version = appConfig.expo.version;

export function SettingsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const doLogout = async () => {
    setLoggingOut(true);
    try { await logout(); }
    finally { setLoggingOut(false); setConfirmLogout(false); }
  };

  const showLegalNotice = (title: string) => Alert.alert(title, "Legal document links are not configured in this build.");

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headingGroup}>
          <Text style={styles.heading} accessibilityRole="header">Settings</Text>
          <Text style={styles.subtitle}>Manage your account and review app information.</Text>
        </View>

        <Card style={styles.accountCard}>
          <View style={styles.accountIcon}><UserRound size={iconSizes.lg} color={colors.primaryDark} /></View>
          <View style={styles.accountCopy}>
            <Text style={styles.cardTitle}>Account</Text>
            <Text style={styles.accountName} numberOfLines={1}>{user?.name && user.name !== user.phone ? user.name : "Personal information"}</Text>
            {user?.phone ? <Text style={styles.meta}>{user.phone}</Text> : null}
            <Pressable onPress={() => navigation.navigate("EditProfile")} accessibilityRole="button" style={styles.textLink}>
              <Text style={styles.textLinkLabel}>Edit personal information</Text>
              <ChevronRight size={iconSizes.sm} color={colors.primaryDark} />
            </Pressable>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Privacy & security</Text>
        <Card style={styles.securityCard}>
          <View style={styles.securityIcon}><ShieldCheck size={iconSizes.lg} color={colors.primaryDark} /></View>
          <View style={styles.securityCopy}>
            <Text style={styles.cardTitle}>Protected account access</Text>
            <Text style={styles.body}>Sign in uses a one-time passcode. Your account data is accessed through your authenticated session.</Text>
          </View>
        </Card>
        <Card style={styles.securityCard}>
          <View style={styles.securityIcon}><LockKeyhole size={iconSizes.lg} color={colors.primaryDark} /></View>
          <View style={styles.securityCopy}>
            <Text style={styles.cardTitle}>Private on this device</Text>
            <Text style={styles.body}>Sign out when you finish on a shared device. Session credentials are stored using the platform secure store.</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Legal</Text>
        <Card style={styles.menuCard}>
          <LegalRow label="Terms of Service" onPress={() => showLegalNotice("Terms of Service")} />
          <LegalRow label="Privacy Policy" onPress={() => showLegalNotice("Privacy Policy")} last />
        </Card>
        <Text style={styles.legalHint}>Document links are not configured in this build.</Text>

        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.aboutCard}>
          <View style={styles.aboutIcon}><FileText size={iconSizes.md} color={colors.primaryDark} /></View>
          <Text style={styles.aboutLabel}>Med4U</Text>
          <Text style={styles.version}>Version {version}</Text>
        </Card>

        <Button title="Log out" variant="danger" leftIcon={<LogOut color={colors.white} size={iconSizes.md} />} onPress={() => setConfirmLogout(true)} />
      </ScrollView>
      <ConfirmationDialog
        visible={confirmLogout}
        title="Log out?"
        message="You'll need to verify your phone number again to sign back in."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        destructive
        loading={loggingOut}
        onConfirm={doLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </Screen>
  );
}

function LegalRow({ label, onPress, last = false }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.legalRow, !last && styles.divider, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight size={iconSizes.md} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  headingGroup: { gap: spacing.xxs, marginBottom: spacing.xs },
  heading: { ...typography.h1, color: colors.primaryDark },
  subtitle: { ...typography.body, color: colors.textMuted },
  accountCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  accountIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  accountCopy: { flex: 1, gap: spacing.xxs },
  cardTitle: { ...typography.bodyBold, color: colors.primaryDark },
  accountName: { ...typography.title, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  textLink: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.xxs, alignSelf: "flex-start" },
  textLinkLabel: { ...typography.bodyBold, color: colors.primaryDark },
  sectionTitle: { ...typography.title, color: colors.primaryDark, marginTop: spacing.xs },
  securityCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  securityIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.lightSage, alignItems: "center", justifyContent: "center" },
  securityCopy: { flex: 1, gap: spacing.xxs },
  body: { ...typography.body, color: colors.textMuted },
  menuCard: { padding: 0, overflow: "hidden" },
  legalRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  rowLabel: { ...typography.bodyBold, color: colors.text },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.chip },
  legalHint: { ...typography.caption, color: colors.textMuted },
  aboutCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  aboutIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  aboutLabel: { ...typography.bodyBold, flex: 1, color: colors.text },
  version: { ...typography.caption, color: colors.textMuted },
});
