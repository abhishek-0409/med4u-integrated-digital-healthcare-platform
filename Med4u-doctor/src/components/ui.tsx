import React from "react";
import {
  Pressable,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import {
  CalendarDays,
  ClipboardList,
  Home,
  UserRound,
  ArrowLeft,
  LucideIcon,
} from "lucide-react-native";
import { DoctorAppointment } from "../types/appointment";
import { DoctorStackParamList } from "../types/navigation";
import { colors, round, space, type } from "../theme/tokens";
import { useAuth } from "../auth/authContext";

export function Page({
  children,
  activeTab,
  scroll = true,
  refreshControl,
}: {
  children: React.ReactNode;
  activeTab?: "Dashboard" | "Appointments" | "Availability" | "Profile";
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const { isDemo } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {isDemo ? (
        <View style={styles.demoBanner} accessibilityRole="alert" accessibilityLabel="Demo mode. Synthetic data. Local development only.">
          <Text style={styles.demoBannerText}>DEMO MODE · SYNTHETIC DATA · LOCAL DEVELOPMENT ONLY</Text>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex]}>{children}</View>
      )}
      {activeTab ? <BottomNavigation active={activeTab} /> : null}
    </SafeAreaView>
  );
}

export function TopBar({ title, back = false }: { title: string; back?: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<DoctorStackParamList>>();
  return (
    <View style={styles.topBar}>
      {back ? (
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={21} color={colors.forest} />
        </Pressable>
      ) : null}
      <Text style={styles.topTitle}>{title}</Text>
    </View>
  );
}

export function PreviewLabel({ text = "MOCK DATA · PREVIEW ONLY" }: { text?: string }) {
  return (
    <View style={styles.previewLabel}>
      <View style={styles.previewDot} />
      <Text style={styles.previewText}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondaryAction,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatusTag({ status }: { status: DoctorAppointment["status"] }) {
  const label = status === "confirmed" ? "Confirmed" : status === "pending" ? "Pending" : "Completed";
  return (
    <View style={[styles.statusTag, status === "pending" && styles.pendingTag]}>
      <Text style={[styles.statusText, status === "pending" && styles.pendingText]}>{label}</Text>
    </View>
  );
}

export function AppointmentRow({
  appointment,
  onPress,
}: {
  appointment: DoctorAppointment;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${appointment.patientName}, ${appointment.time}, ${appointment.status}. View appointment details.`}
      style={({ pressed }) => [styles.appointmentRow, pressed && styles.pressed]}
    >
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{appointment.time}</Text>
        <View style={styles.timeRule} />
      </View>
      <View style={styles.appointmentContent}>
        <View style={styles.appointmentTopLine}>
          <Text style={styles.patientName} numberOfLines={1}>{appointment.patientName}</Text>
          <StatusTag status={appointment.status} />
        </View>
        <Text style={styles.appointmentReason} numberOfLines={1}>{appointment.reason}</Text>
        <Text style={styles.appointmentMeta}>{appointment.mode} · {appointment.date}</Text>
      </View>
    </Pressable>
  );
}

function BottomNavigation({
  active,
}: {
  active: "Dashboard" | "Appointments" | "Availability" | "Profile";
}) {
  const navigation = useNavigation<NativeStackNavigationProp<DoctorStackParamList>>();
  const tabs: Array<{ route: typeof active; label: string; icon: LucideIcon }> = [
    { route: "Dashboard", label: "Home", icon: Home },
    { route: "Appointments", label: "Appointments", icon: CalendarDays },
    { route: "Availability", label: "Availability", icon: ClipboardList },
    { route: "Profile", label: "Profile", icon: UserRound },
  ];
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.route === active;
        return (
          <Pressable
            key={tab.route}
            onPress={() => { if (!selected) navigation.reset({ index: 0, routes: [{ name: tab.route }] }); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={styles.tab}
          >
            <Icon size={19} color={selected ? colors.forest : colors.muted} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  demoBanner: { backgroundColor: "#805313", paddingVertical: 6, paddingHorizontal: 12, alignItems: "center" },
  demoBannerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  topBar: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: space.sm },
  back: { width: 40, height: 40, justifyContent: "center" },
  topTitle: { ...type.title, flex: 1 },
  previewLabel: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: round.pill,
    backgroundColor: colors.sageLight,
  },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  previewText: { fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 0.5, color: colors.forest },
  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: round.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  action: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: round.md,
    backgroundColor: colors.forest,
  },
  actionText: { fontSize: 15, fontWeight: "700", color: colors.card },
  secondaryAction: { backgroundColor: colors.sageLight },
  secondaryText: { color: colors.forest },
  disabledAction: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { ...type.heading },
  sectionAction: { fontSize: 14, fontWeight: "700", color: colors.green },
  statusTag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: round.pill, backgroundColor: colors.sageLight },
  statusText: { fontSize: 11, fontWeight: "700", color: colors.forest },
  pendingTag: { backgroundColor: colors.cream },
  pendingText: { color: colors.warning },
  appointmentRow: { flexDirection: "row", gap: space.sm, minHeight: 84 },
  timeColumn: { width: 66, alignItems: "center", gap: 6 },
  timeText: { fontSize: 12, fontWeight: "700", color: colors.forest },
  timeRule: { flex: 1, width: 1, backgroundColor: colors.border },
  appointmentContent: { flex: 1, gap: 4, paddingBottom: space.md },
  appointmentTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  patientName: { ...type.label, flex: 1 },
  appointmentReason: { fontSize: 13, lineHeight: 18, color: colors.muted },
  appointmentMeta: { fontSize: 12, lineHeight: 17, color: colors.muted },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: space.sm,
    paddingBottom: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, minWidth: 64, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 },
  tabLabel: { fontSize: 10, color: colors.muted },
  tabLabelActive: { color: colors.forest, fontWeight: "700" },
});
