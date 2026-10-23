import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  CalendarClock,
  BadgeCheck,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  LogOut,
  Pencil,
  Settings,
  ShoppingBag,
} from "lucide-react-native";
import { Avatar } from "../../components/ui/Avatar";
import { ConfirmationDialog } from "../../components/ui/ConfirmationDialog";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Loader } from "../../components/ui/Loader";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { userService } from "../../services/user.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { ageFromDob } from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "Profile">;

const GENDER_LABEL = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
} as const;

export function ProfileScreen({ navigation }: Props) {
  const { user: cachedUser, setUser, logout } = useAuth();
  const { data: fetched, loading, error, reload } = useAsyncData(() => userService.getProfile(), []);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Refetch after returning from the edit screen.
  useRefreshOnFocus(reload);

  // Keep the store in sync so other screens (e.g. the Home greeting) show the latest profile.
  useEffect(() => {
    if (fetched) {
      setUser(fetched);
    }
  }, [fetched, setUser]);

  // The server copy wins; the cached login user only covers the first paint.
  const user = fetched ?? cachedUser;

  if (!user) {
    if (loading) {
      return <Loader />;
    }
    return <ErrorState message={error ?? "Couldn't load your profile."} onRetry={reload} />;
  }

  const needsName = user.name === user.phone;
  const age = ageFromDob(user.dob);

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageLabel}>MY ACCOUNT</Text>
        <View style={styles.profileHeader}>
          <View style={styles.avatarFrame}>
            <Avatar uri={user.avatarUrl} name={needsName ? "New member" : user.name} size={64} />
          </View>
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={2}>
              {needsName ? "New member" : user.name}
            </Text>
            <Text style={styles.meta}>{user.phone}</Text>
            {user.email ? <Text style={styles.meta}>{user.email}</Text> : null}
            {user.isVerified ? (
              <View style={styles.verifiedRow}>
                <BadgeCheck size={14} color={colors.primaryGreen} />
                <Text style={styles.verified}>Verified account</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}
            onPress={() => navigation.navigate("EditProfile")}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Pencil size={16} color={colors.primaryGreen} />
          </Pressable>
        </View>

        {error ? (
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.staleNotice}>Couldn't refresh your profile. Tap to retry.</Text>
          </Pressable>
        ) : null}

        {needsName ? (
          <InfoBanner message="Add your name and health details to complete your profile." />
        ) : null}

        <View style={styles.statsRow}>
          <StatItem label="Age" value={age !== null ? `${age} years` : "Not added"} />
          <StatItem label="Blood group" value={user.bloodGroup ? (user.bloodGroup === "unknown" ? "Unknown" : user.bloodGroup) : "Not added"} />
          <StatItem label="Gender" value={user.gender ? GENDER_LABEL[user.gender] : "Not added"} />
        </View>

        <Text style={styles.sectionTitle}>Your care</Text>
        <View style={styles.menuCard}>
          <MenuItem
            label="My appointments"
            icon={<CalendarClock size={iconSizes.md} color={colors.primaryDark} />}
            onPress={() => navigation.navigate("Appointments")}
          />
          <MenuItem
            label="My orders"
            icon={<ShoppingBag size={iconSizes.md} color={colors.primaryDark} />}
            onPress={() => navigation.navigate("Orders")}
          />
          <MenuItem
            label="Prescriptions"
            icon={<ClipboardList size={iconSizes.md} color={colors.primaryDark} />}
            onPress={() => navigation.navigate("Prescription")}
          />
          <MenuItem
            label="Lab reports"
            icon={<FlaskConical size={iconSizes.md} color={colors.primaryDark} />}
            onPress={() => navigation.navigate("Reports")}
          />
          <MenuItem
            label="Settings"
            icon={<Settings size={iconSizes.md} color={colors.primaryDark} />}
            onPress={() => navigation.navigate("Settings")}
            last
          />
        </View>

        <Text style={styles.sectionTitle}>Account actions</Text>
        <View style={styles.menuCard}>
          <MenuItem
            label="Log out"
            icon={<LogOut size={iconSizes.md} color={colors.danger} />}
            onPress={() => setConfirmLogout(true)}
            danger
            last
          />
        </View>
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

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function MenuItem({
  label,
  hint,
  icon,
  onPress,
  danger,
  last,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, !last && styles.menuItemDivider, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
    >
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>{icon}</View>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      {hint ? <Text style={styles.menuHint}>{hint}</Text> : null}
      {!danger ? <ChevronRight size={iconSizes.md} color={colors.textSubtle} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  pageLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  avatarFrame: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.lightSage,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.h2,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    color: colors.mainText,
  },
  meta: {
    ...typography.body,
    color: colors.secondaryText,
  },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xxs, marginTop: 2 },
  verified: {
    ...typography.caption,
    color: colors.primaryGreen,
    fontWeight: "600",
  },
  editAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.primaryDark,
    marginTop: spacing.xs,
  },
  staleNotice: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: 68,
  },
  statValue: {
    ...typography.bodyBold,
    color: colors.mainText,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSubtle,
    fontSize: 11,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  menuIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.lightSage,
  },
  menuIconDanger: {
    backgroundColor: colors.dangerLight,
  },
  menuLabel: {
    ...typography.bodyBold,
    flex: 1,
    fontWeight: "500",
  },
  menuLabelDanger: { color: colors.danger },
  menuHint: {
    ...typography.caption,
    color: colors.textSubtle,
  },
});
