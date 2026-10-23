import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Inbox,
  LucideIcon,
  MapPin,
  RefreshCw,
  Video,
} from "lucide-react-native";
import { colors, round, space, type } from "../theme/tokens";
import { AvailabilitySummary, DashboardAppointment, DashboardModel, greetingFor, initialsOf } from "./dashboardModel";
import { DashboardResult, Section } from "./loadDashboard";

export interface DashboardActions {
  openAppointment(id: string): void;
  joinAppointment(id: string): void;
  openAppointments(filter?: "upcoming" | "pending"): void;
  openAvailability(): void;
  openHistory(): void;
  openProfile(): void;
  retry(): void;
}

interface Props {
  doctorName: string;
  avatarUrl: string | null;
  loading: boolean;
  result: DashboardResult | null;
  actions: DashboardActions;
  now?: Date;
}

export function DashboardView({ doctorName, avatarUrl, loading, result, actions, now = new Date() }: Props) {
  const appointments = result?.appointments;
  const model = appointments?.status === "ready" ? appointments.data : null;
  const pendingCount = model?.counts.pending ?? 0;
  const verified = result?.verified === true;
  return (
    <View style={styles.root}>
      <Header
        name={doctorName}
        avatarUrl={result?.avatarUrl ?? avatarUrl}
        verified={verified}
        availability={result?.availability}
        loading={loading}
        pending={pendingCount}
        pendingIsLowerBound={model?.pendingIsLowerBound ?? false}
        greeting={greetingFor(now)}
        actions={actions}
      />

      {loading ? <DashboardSkeleton /> : appointments?.status === "error" ? (
        <ErrorCard title="Couldn't load your appointments" message={appointments.message} onRetry={actions.retry} />
      ) : model ? (
        <>
          <Overview model={model} />
          <NextAppointment appointment={model.next} actions={actions} />
          <TodayList model={model} actions={actions} />
        </>
      ) : null}

      <QuickActions actions={actions} />
      <AvailabilityCard loading={loading} section={result?.availability} actions={actions} />
    </View>
  );
}

function Header({ name, avatarUrl, verified, availability, loading, pending, pendingIsLowerBound, greeting, actions }: {
  name: string; avatarUrl: string | null; verified: boolean; availability?: Section<AvailabilitySummary>; loading: boolean;
  pending: number; pendingIsLowerBound: boolean; greeting: string; actions: DashboardActions;
}) {
  const status = availability?.status === "ready"
    ? availability.data.acceptingToday ? { text: "Accepting bookings today", on: true } : { text: "Not accepting bookings today", on: false }
    : null;
  const badge = pendingIsLowerBound ? `${pending}+` : String(pending);
  return (
    <View style={styles.header}>
      <Pressable onPress={actions.openProfile} accessibilityRole="button" accessibilityLabel="Open your profile" style={styles.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{initialsOf(name)}</Text></View>
        )}
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.greeting}>{greeting}</Text>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {verified ? <View style={styles.verified} accessibilityLabel="Verified doctor"><CheckCircle2 size={14} color={colors.green} /></View> : null}
        </View>
        {loading ? <View style={[styles.skel, { width: 150, height: 12 }]} /> : status ? (
          <View style={styles.statusRow} accessibilityLabel={status.text}>
            <View style={[styles.dot, !status.on && styles.dotOff]} />
            <Text style={styles.statusText} numberOfLines={1}>{status.text}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={() => actions.openAppointments("pending")}
        accessibilityRole="button"
        accessibilityLabel={pending > 0 ? `Appointment requests, ${badge} pending` : "Appointment requests"}
        style={styles.bell}
      >
        <Bell size={21} color={colors.forest} />
        {pending > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      </Pressable>
    </View>
  );
}

function Overview({ model }: { model: DashboardModel }) {
  const { counts, pendingIsLowerBound } = model;
  return (
    <View style={styles.overview}>
      <Stat icon={CalendarClock} label="Today" value={String(counts.today)} />
      <Stat icon={Inbox} label="Requests" value={pendingIsLowerBound ? `${counts.pending}+` : String(counts.pending)} />
      <Stat icon={CheckCircle2} label="Completed" value={String(counts.completed)} />
    </View>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon size={16} color={colors.green} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function TypeIcon({ type: kind }: { type: DashboardAppointment["type"] }) {
  const Icon = kind === "video" ? Video : MapPin;
  return <Icon size={13} color={colors.muted} />;
}

export function StatusPill({ status, label }: { status: DashboardAppointment["status"]; label: string }) {
  const pending = status === "pending";
  return (
    <View style={[styles.pill, pending && styles.pillPending]}>
      <Text style={[styles.pillText, pending && styles.pillTextPending]}>{label}</Text>
    </View>
  );
}

function NextAppointment({ appointment, actions }: { appointment: DashboardAppointment | null; actions: DashboardActions }) {
  if (!appointment) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>NEXT APPOINTMENT</Text>
        <Text style={styles.emptyTitle}>No upcoming appointments</Text>
        <Text style={styles.emptyCopy}>New bookings will appear here. Keeping your availability up to date helps patients find open slots.</Text>
        <Pressable onPress={actions.openAvailability} accessibilityRole="button" accessibilityLabel="Manage availability" style={[styles.btn, styles.btnSecondary]}>
          <Text style={styles.btnSecondaryText}>Manage availability</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.nextCard]}>
      <View style={styles.rowBetween}>
        <Text style={styles.eyebrow}>NEXT APPOINTMENT</Text>
        <StatusPill status={appointment.status} label={appointment.statusLabel} />
      </View>
      <Text style={styles.nextName} numberOfLines={2}>{appointment.patientName}</Text>
      <View style={styles.metaRow}>
        <View style={styles.meta}><CalendarDays size={14} color={colors.muted} /><Text style={styles.metaText}>{appointment.dayLabel}, {appointment.timeLabel}</Text></View>
        <View style={styles.meta}><TypeIcon type={appointment.type} /><Text style={styles.metaText}>{appointment.typeLabel}</Text></View>
      </View>
      <View style={styles.btnRow}>
        <Pressable
          onPress={() => actions.openAppointment(appointment.id)}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${appointment.patientName}`}
          style={[styles.btn, styles.btnSecondary, styles.btnFlex]}
        >
          <Text style={styles.btnSecondaryText}>View details</Text>
        </Pressable>
        {appointment.canJoin ? (
          <Pressable
            onPress={() => actions.joinAppointment(appointment.id)}
            accessibilityRole="button"
            accessibilityLabel={`Join consultation with ${appointment.patientName}`}
            style={[styles.btn, styles.btnPrimary, styles.btnFlex]}
          >
            <Video size={16} color={colors.card} />
            <Text style={styles.btnPrimaryText}>Join</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TodayList({ model, actions }: { model: DashboardModel; actions: DashboardActions }) {
  return (
    <View style={styles.sectionGap}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Today's appointments</Text>
        <Pressable onPress={() => actions.openAppointments("upcoming")} accessibilityRole="button" accessibilityLabel="View all appointments" style={styles.linkHit}>
          <Text style={styles.link}>View all</Text>
        </Pressable>
      </View>
      <View style={styles.listCard}>
        {model.todayList.length === 0 ? (
          <View style={styles.emptyList}>
            <CalendarDays size={22} color={colors.sage} />
            <Text style={styles.emptyTitle}>No appointments today</Text>
            <Text style={styles.emptyCopy}>Your schedule is clear.</Text>
          </View>
        ) : model.todayList.map((a, index) => (
          <Pressable
            key={a.id}
            onPress={() => actions.openAppointment(a.id)}
            accessibilityRole="button"
            accessibilityLabel={`${a.patientName}, ${a.timeLabel}, ${a.typeLabel}, ${a.statusLabel}. View details.`}
            style={({ pressed }) => [styles.listRow, index > 0 && styles.listRowBorder, pressed && styles.pressed]}
          >
            <Text style={styles.listTime}>{a.timeLabel}</Text>
            <View style={styles.listBody}>
              <Text style={styles.listName} numberOfLines={1}>{a.patientName}</Text>
              <View style={styles.meta}><TypeIcon type={a.type} /><Text style={styles.metaText}>{a.typeLabel}</Text></View>
            </View>
            <StatusPill status={a.status} label={a.statusLabel} />
            <ChevronRight size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function QuickActions({ actions }: { actions: DashboardActions }) {
  const items: Array<{ label: string; icon: LucideIcon; onPress: () => void }> = [
    { label: "Manage Availability", icon: CalendarClock, onPress: actions.openAvailability },
    { label: "Appointment Requests", icon: Inbox, onPress: () => actions.openAppointments("pending") },
    { label: "Patient History", icon: ClipboardList, onPress: actions.openHistory },
    { label: "Prescriptions", icon: FileText, onPress: actions.openHistory },
  ];
  return (
    <View style={styles.sectionGap}>
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.grid}>
        {items.map(({ label, icon: Icon, onPress }) => (
          <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <View style={styles.tileIcon}><Icon size={18} color={colors.forest} /></View>
            <Text style={styles.tileLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function AvailabilityCard({ loading, section, actions }: { loading: boolean; section?: Section<AvailabilitySummary>; actions: DashboardActions }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Availability</Text>
        <Pressable onPress={actions.openAvailability} accessibilityRole="button" accessibilityLabel="Edit schedule" style={styles.linkHit}>
          <Text style={styles.link}>Edit schedule</Text>
        </Pressable>
      </View>
      {loading ? (
        <><View style={[styles.skel, { width: "60%", height: 14 }]} /><View style={[styles.skel, { width: "40%", height: 12 }]} /></>
      ) : section?.status === "ready" ? (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.dot, !section.data.acceptingToday && styles.dotOff]} />
            <Text style={styles.availLine}>{section.data.acceptingToday ? "Accepting bookings today" : "Not accepting bookings today"}</Text>
          </View>
          <Text style={styles.metaText}>
            {section.data.hoursToday ? `Today's hours: ${section.data.hoursToday}` : "No hours set for today"}
          </Text>
          {section.data.acceptingToday && section.data.hoursToday ? (
            <Text style={styles.metaText}>
              {section.data.nextSlot ? `Next open slot: ${section.data.nextSlot}` : "No open slots remaining today"}
            </Text>
          ) : null}
        </>
      ) : (
        <View style={styles.inlineError}>
          <Text style={styles.metaText}>{section?.status === "error" ? "Availability couldn't be loaded." : "Availability is unavailable."}</Text>
          <Pressable onPress={actions.retry} accessibilityRole="button" accessibilityLabel="Retry loading availability" style={styles.linkHit}>
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ErrorCard({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <View style={[styles.card, styles.errorCard]} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.metaText}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry" style={[styles.btn, styles.btnSecondary]}>
        <RefreshCw size={15} color={colors.forest} />
        <Text style={styles.btnSecondaryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={styles.root} accessibilityLabel="Loading your dashboard" accessibilityState={{ busy: true }} testID="dashboard-skeleton">
      <View style={styles.overview}>
        {[0, 1, 2].map((i) => <View key={i} style={[styles.stat, { height: 84 }]}><View style={[styles.skel, { width: 28, height: 22 }]} /><View style={[styles.skel, { width: 54, height: 10 }]} /></View>)}
      </View>
      <View style={styles.card}>
        <View style={[styles.skel, { width: 110, height: 10 }]} />
        <View style={[styles.skel, { width: "65%", height: 20 }]} />
        <View style={[styles.skel, { width: "45%", height: 12 }]} />
        <View style={[styles.skel, { width: "100%", height: 44, borderRadius: round.md }]} />
      </View>
      <View style={styles.listCard}>
        {[0, 1].map((i) => <View key={i} style={[styles.listRow, i > 0 && styles.listRowBorder]}><View style={[styles.skel, { width: 56, height: 12 }]} /><View style={{ flex: 1, gap: 6 }}><View style={[styles.skel, { width: "55%", height: 14 }]} /><View style={[styles.skel, { width: "30%", height: 10 }]} /></View></View>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  avatarWrap: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.sageLight },
  avatarText: { fontSize: 16, fontWeight: "700", color: colors.forest },
  headerText: { flex: 1, gap: 1 },
  greeting: { ...type.caption },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.forest, flexShrink: 1 },
  verified: { justifyContent: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.sage },
  statusText: { fontSize: 12, lineHeight: 16, color: colors.muted, flexShrink: 1 },
  bell: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  badge: { position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.green },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.card },

  overview: { flexDirection: "row", gap: space.xs },
  stat: { flex: 1, gap: 4, padding: space.sm, borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors.forest },
  statLabel: { fontSize: 12, lineHeight: 16, color: colors.muted },

  card: { gap: space.xs, padding: space.md, borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  nextCard: { borderColor: colors.sage },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: "600", letterSpacing: 0.6, color: colors.muted },
  nextName: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: colors.text },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs },
  metaRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, lineHeight: 18, color: colors.muted },
  btnRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  btn: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.md, borderRadius: round.md },
  btnFlex: { flex: 1 },
  btnPrimary: { backgroundColor: colors.forest },
  btnPrimaryText: { fontSize: 14, fontWeight: "600", color: colors.card },
  btnSecondary: { backgroundColor: colors.sageLight },
  btnSecondaryText: { fontSize: 14, fontWeight: "600", color: colors.forest },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: round.pill, backgroundColor: colors.sageLight },
  pillPending: { backgroundColor: colors.cream },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: colors.forest },
  pillTextPending: { color: colors.warning },

  sectionGap: { gap: space.xs },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.text },
  link: { fontSize: 13, fontWeight: "600", color: colors.green },
  linkHit: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  listCard: { borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  listRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listTime: { width: 64, fontSize: 12, fontWeight: "600", color: colors.forest },
  listBody: { flex: 1, gap: 2 },
  listName: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text },
  emptyList: { alignItems: "center", gap: 4, paddingVertical: space.xl, paddingHorizontal: space.md },
  emptyTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.text },
  emptyCopy: { fontSize: 13, lineHeight: 18, color: colors.muted },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tile: { flexBasis: "47%", flexGrow: 1, minHeight: 84, gap: space.xs, padding: space.sm, borderRadius: round.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tileIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.sageLight },
  tileLabel: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.text },

  availLine: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text, flexShrink: 1 },
  inlineError: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs },
  errorCard: { borderColor: colors.border },
  errorTitle: { fontSize: 15, fontWeight: "600", color: colors.danger },
  skel: { borderRadius: 6, backgroundColor: colors.sageLight },
  pressed: { opacity: 0.7 },
});
