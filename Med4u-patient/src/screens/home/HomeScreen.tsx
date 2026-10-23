import React, { useEffect, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  Home,
  IndianRupee,
  LucideIcon,
  MapPin,
  Pill,
  Stethoscope,
  TestTube2,
  UserRound,
  Video,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { DoctorPortrait } from "../../components/doctor/DoctorPortrait";
import { EmptyState } from "../../components/ui/EmptyState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { LoadingSkeleton, SkeletonBlock } from "../../components/ui/LoadingSkeleton";
import { RatingDisplay } from "../../components/ui/RatingDisplay";
import { SearchBar } from "../../components/ui/SearchBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { appointmentService } from "../../services/appointment.service";
import { doctorService } from "../../services/doctor.service";
import { notificationService } from "../../services/notification.service";
import { colors } from "../../theme/colors";
import { iconSizes, layout, radius, shadows, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { Appointment } from "../../types/appointment";
import { formatClinicDate, formatClinicTime, formatExperience, formatFee, getGreeting } from "../../utils/helpers";
import { canJoinUpcomingAppointment, selectUpcomingAppointment } from "./homeAppointment";

type Props = NativeStackScreenProps<MainStackParamList, "Home">;
interface QuickAction {
  label: string;
  icon: LucideIcon;
  route: "DoctorList" | "OrderMedicine" | "BookTest";
  accessibility: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Doctors", icon: Stethoscope, route: "DoctorList", accessibility: "Browse doctors" },
  { label: "Medicines", icon: Pill, route: "OrderMedicine", accessibility: "Browse medicines" },
  { label: "Lab Tests", icon: TestTube2, route: "BookTest", accessibility: "Browse lab tests" },
  { label: "Consult Now", icon: Video, route: "DoctorList", accessibility: "Find a doctor for a consultation" },
];

const DOCTOR_COUNT = 6;
const bannerImage = require("../../assets/home-consultation-doctor.jpg");

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.sectionError}>
      <Text style={styles.errorText}>{message}</Text>
      <Button title="Retry" variant="secondary" size="sm" fullWidth={false} onPress={onRetry} />
    </View>
  );
}

function FeaturedDoctorCard({
  doctor,
  onPress,
  onBook,
}: {
  doctor: import("../../types/doctor").Doctor;
  onPress: () => void;
  onBook: () => void;
}) {
  return (
    <View style={styles.doctorCard}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.doctorInfo, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${doctor.name}, ${doctor.specialization}, ${doctor.experienceYears == null ? "experience not provided" : `${doctor.experienceYears} years experience`}. Open profile.`}
      >
        <View style={styles.doctorCopy}>
          <Text style={styles.doctorName} numberOfLines={1}>{doctor.name}</Text>
          <Text style={styles.doctorSpecialty} numberOfLines={1}>{doctor.specialization}</Text>
          {doctor.experienceYears ? (
            <Text style={styles.experience} numberOfLines={1}>{formatExperience(doctor.experienceYears, true)} experience</Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.doctorMeta}>
        <RatingDisplay rating={doctor.rating} reviewCount={doctor.reviewCount} />
        {doctor.isDemo ? <StatusBadge label="Demo profile" tone="info" /> : null}
        {!doctor.isDemo && doctor.isVerified ? <StatusBadge label="Verified" tone="success" /> : null}
      </View>
      <View style={styles.doctorDetails}>
        <View style={styles.doctorDetailLine}>
          <IndianRupee size={iconSizes.xs} color={colors.primaryGreen} />
          <Text style={styles.doctorDetailText}>{doctor.consultationFee == null ? "Fee not provided" : `${formatFee(doctor.consultationFee)} consultation`}</Text>
        </View>
        <View style={styles.doctorDetailLine}>
          {doctor.consultationMode === "OFFLINE" ? (
            <MapPin size={iconSizes.xs} color={colors.secondaryText} />
          ) : (
            <Video size={iconSizes.xs} color={colors.secondaryText} />
          )}
          <Text style={styles.doctorDetailText} numberOfLines={1}>
            {doctor.consultationMode === "BOTH" ? "Video or in-person" : doctor.consultationMode === "ONLINE" ? "Video consultation" : "In-person visit"}
          </Text>
        </View>
      </View>
      <Button
        title="Book appointment"
        size="sm"
        onPress={onBook}
        accessibilityLabel={`Book an appointment with ${doctor.name}`}
      />
    </View>
  );
}

function BottomNavigation({
  active,
  onNavigate,
}: {
  active: "Home";
  onNavigate: (route: "Home" | "Appointments" | "Orders" | "Profile") => void;
}) {
  const items: Array<{
    label: string;
    route: "Home" | "Appointments" | "Orders" | "Profile";
    icon: LucideIcon;
  }> = [
    { label: "Home", route: "Home", icon: Home },
    { label: "Appointments", route: "Appointments", icon: CalendarDays },
    { label: "Orders", route: "Orders", icon: ClipboardList },
    { label: "Profile", route: "Profile", icon: UserRound },
  ];

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const selected = item.route === active;
        return (
          <Pressable
            key={item.route}
            onPress={() => onNavigate(item.route)}
            style={styles.navItem}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
          >
            <View style={[styles.navIconWrap, selected && styles.navIconWrapSelected]}>
              <item.icon size={iconSizes.md} color={selected ? colors.forestGreen : colors.textMuted} />
            </View>
            <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function UpcomingAppointmentCard({
  appointment,
  onView,
  onJoin,
  onViewAll,
}: {
  appointment: Appointment;
  onView: () => void;
  onJoin: () => void;
  onViewAll: () => void;
}) {
  const canJoin = canJoinUpcomingAppointment(appointment);
  const status = appointment.paymentStatus === "PENDING"
    ? { label: "Payment pending", tone: "warning" as const }
    : appointment.paymentStatus === "FAILED"
      ? { label: "Payment failed", tone: "danger" as const }
    : appointment.status === "confirmed"
      ? { label: "Confirmed", tone: "success" as const }
      : { label: "Awaiting confirmation", tone: "warning" as const };

  return (
    <View style={styles.upcomingCard}>
      <View style={styles.upcomingHeading}>
        <Text style={styles.upcomingEyebrow}>UPCOMING APPOINTMENT</Text>
        <Pressable onPress={onViewAll} accessibilityRole="button" accessibilityLabel="View all appointments">
          <Text style={styles.upcomingAll}>View all</Text>
        </Pressable>
      </View>
      <View style={styles.upcomingDetails}>
        <DoctorPortrait
          doctorId={appointment.doctor.id}
          uri={appointment.doctor.avatarUrl}
          name={appointment.doctor.name}
          gender={appointment.doctor.gender}
          isDemo={appointment.doctor.isDemo}
          width={48}
          height={48}
        />
        <View style={styles.upcomingCopy}>
          <Text style={styles.upcomingDoctor} numberOfLines={1}>{appointment.doctor.name}</Text>
          <Text style={styles.upcomingSpecialty} numberOfLines={1}>{appointment.doctor.specialization}</Text>
          <View style={styles.upcomingMeta}>
            <Clock3 size={13} color={colors.secondaryText} />
            <Text style={styles.upcomingMetaText} numberOfLines={1}>
              {formatClinicDate(appointment.date)} · {formatClinicTime(appointment.startTime)}
            </Text>
          </View>
          <View style={styles.upcomingPills}>
            <StatusBadge label={status.label} tone={status.tone} />
            <Text style={styles.upcomingType}>{appointment.type === "video" ? "Video" : "In-person"}</Text>
          </View>
        </View>
      </View>
      <Button
        title={canJoin ? "Join Consultation" : "View Appointment"}
        variant="primary"
        size="sm"
        onPress={canJoin ? onJoin : onView}
        style={styles.upcomingAction}
      />
    </View>
  );
}

function AppointmentBannerLoading() {
  return (
    <View style={[styles.banner, styles.appointmentState]} accessibilityRole="progressbar" accessibilityLabel="Loading appointments">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.appointmentStateText}>Checking your appointments…</Text>
    </View>
  );
}

function AppointmentBannerError({ retry }: { retry: () => void }) {
  return (
    <View style={[styles.banner, styles.appointmentState]}>
      <Text style={styles.appointmentErrorTitle}>Appointments unavailable</Text>
      <Text style={styles.appointmentStateText}>We couldn’t load your appointment status.</Text>
      <Button title="Retry" variant="secondary" size="sm" fullWidth={false} onPress={retry} />
    </View>
  );
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const doctors = useAsyncData(
    () => doctorService.list({ sortBy: "rating", limit: DOCTOR_COUNT }),
    [],
  );
  const appointments = useAsyncData(
    () => appointmentService.list({ scope: "upcoming", page: 1, limit: 50 }),
    [],
  );
  const notificationCount = useAsyncData(() => notificationService.unreadCount(), []);
  useRefreshOnFocus(appointments.reload);
  useRefreshOnFocus(notificationCount.reload);
  useEffect(() => {
    let wentToBackground = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "inactive" || state === "background") wentToBackground = true;
      if (state === "active" && wentToBackground) {
        wentToBackground = false;
        notificationCount.reload();
      }
    });
    return () => subscription.remove();
  }, [notificationCount.reload]);

  const firstName = user?.name && user.name !== user.phone ? user.name.trim().split(/\s+/)[0] : "there";
  const featuredDoctors = doctors.data?.items ?? [];
  const upcomingAppointment = appointments.data
    ? selectUpcomingAppointment(appointments.data.items)
    : null;

  const submitSearch = () => {
    const query = search.trim();
    if (!query) return;
    navigation.navigate("DoctorList", { search: query });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.greetingGroup}>
              <Text style={styles.greetingEyebrow}>Hello,</Text>
              <Text style={styles.greeting} numberOfLines={1}>{getGreeting(firstName)}</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("Notifications")}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={notificationCount.data?.unreadCount ? `Notifications, ${notificationCount.data.unreadCount} unread` : "Notifications"}
            >
              <Bell size={iconSizes.lg} color={colors.forestGreen} />
              {!!notificationCount.data?.unreadCount && notificationCount.data.unreadCount > 0 ? (
                <View style={styles.notificationCount}>
                  <Text style={styles.notificationCountText}>{notificationCount.data.unreadCount > 99 ? "99+" : notificationCount.data.unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Profile")}
              style={styles.avatarButton}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <Avatar uri={user?.avatarUrl} name={user?.name ?? "User"} size={sizes.avatarSm} />
            </Pressable>
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            onSubmit={submitSearch}
            placeholder="Search doctors, medicines, lab tests..."
            accessibilityLabel="Search doctors, medicines, and lab tests"
            style={styles.searchBar}
          />

          <View style={styles.quickActions}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => navigation.navigate(action.route)}
                style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={action.accessibility}
              >
                <View style={styles.quickIcon}>
                  <action.icon size={iconSizes.lg} color={colors.forestGreen} strokeWidth={1.9} />
                </View>
                <Text style={styles.quickLabel} numberOfLines={2}>{action.label}</Text>
              </Pressable>
            ))}
          </View>

          {appointments.loading && !appointments.data ? (
            <AppointmentBannerLoading />
          ) : appointments.error && !appointments.data ? (
            <AppointmentBannerError retry={appointments.reload} />
          ) : upcomingAppointment ? (
            <UpcomingAppointmentCard
              appointment={upcomingAppointment}
              onView={() => navigation.navigate("AppointmentConfirmation", { appointmentId: upcomingAppointment.id })}
              onJoin={() => navigation.navigate("VideoConsult", { appointmentId: upcomingAppointment.id })}
              onViewAll={() => navigation.navigate("Appointments")}
            />
          ) : (
            <ImageBackground source={bannerImage} imageStyle={styles.bannerImage} style={styles.banner}>
              <LinearGradient
                colors={["rgba(23,61,50,0.98)", "rgba(23,61,50,0.90)", "rgba(23,61,50,0.10)"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.bannerOverlay}
              >
                <View style={styles.bannerText}>
                  <Text style={styles.bannerEyebrow}>CARE THAT COMES TO YOU</Text>
                  <Text style={styles.bannerTitle}>Consult top doctors</Text>
                  <Text style={styles.bannerBody}>Online or in person, expert care starts here.</Text>
                  <Button
                    title="Book Appointment"
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    style={styles.bannerButton}
                    onPress={() => navigation.navigate("DoctorList")}
                  />
                </View>
              </LinearGradient>
            </ImageBackground>
          )}

          <View style={styles.doctorsSection}>
            <SectionHeader
              title="Top Doctors"
              actionLabel="See All"
              onAction={() => navigation.navigate("DoctorList")}
            />
            {doctors.loading && !doctors.data ? (
              <FlatList
                data={["one", "two", "three"]}
                horizontal
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.doctorList}
                renderItem={() => (
                  <View style={styles.doctorSkeleton}>
                    <SkeletonBlock height={sizes.avatarMd} width={sizes.avatarMd} />
                    <SkeletonBlock height={18} width="72%" />
                    <SkeletonBlock height={14} width="52%" />
                    <SkeletonBlock height={sizes.buttonSm} width="100%" />
                  </View>
                )}
              />
            ) : doctors.error && !doctors.data ? (
              <SectionError message={doctors.error} onRetry={doctors.reload} />
            ) : featuredDoctors.length === 0 ? (
              <EmptyState icon={Stethoscope} title="No doctors available yet" message="Please check again later." />
            ) : (
              <>
                {featuredDoctors.some((doctor) => doctor.isDemo) ? (
                  <InfoBanner message="Some profiles are fictional demo listings and are labelled as such." />
                ) : null}
                <FlatList
                  data={featuredDoctors}
                  horizontal
                  keyExtractor={(doctor) => doctor.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.doctorList}
                  renderItem={({ item }) => (
                    <FeaturedDoctorCard
                      doctor={item}
                      onPress={() => navigation.navigate("DoctorDetail", { doctorId: item.id })}
                      onBook={() => navigation.navigate("DoctorDetail", { doctorId: item.id })}
                    />
                  )}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <BottomNavigation
        active="Home"
        onNavigate={(route) => {
          if (route !== "Home") navigation.navigate(route);
        }}
      />
      <View style={{ height: insets.bottom, backgroundColor: colors.card }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  content: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: sizes.avatarSm,
  },
  greetingGroup: {
    flex: 1,
    gap: 1,
  },
  greetingEyebrow: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  greeting: {
    ...typography.h3,
    color: colors.forestGreen,
  },
  headerButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCount: {
    position: "absolute",
    top: -4,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  notificationCountText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: colors.white,
  },
  avatarButton: {
    borderWidth: 2,
    borderColor: colors.sageGreen,
    borderRadius: radius.pill,
  },
  searchBar: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderColor: colors.border,
    ...shadows.soft,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  quickAction: {
    flex: 1,
    minHeight: 94,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: 3,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.lightSage,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 15,
  },
  banner: {
    height: 194,
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: colors.forestGreen,
    ...shadows.card,
  },
  bannerImage: {
    borderRadius: radius.xl,
  },
  bannerOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  bannerText: {
    width: "67%",
    gap: spacing.xs,
  },
  bannerEyebrow: {
    ...typography.caption,
    color: colors.lightSage,
    letterSpacing: 0.7,
  },
  bannerTitle: {
    ...typography.h2,
    color: colors.white,
    lineHeight: 26,
  },
  bannerBody: {
    ...typography.caption,
    color: colors.white,
    lineHeight: 17,
  },
  bannerButton: {
    marginTop: spacing.xxs,
    borderColor: colors.white,
  },
  upcomingCard: {
    minHeight: 194,
    padding: spacing.md,
    justifyContent: "space-between",
    gap: spacing.xs,
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    ...shadows.soft,
  },
  upcomingHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  upcomingEyebrow: {
    ...typography.caption,
    color: colors.primaryGreen,
    fontWeight: "700",
    letterSpacing: 0.45,
  },
  upcomingAll: {
    ...typography.caption,
    color: colors.primaryGreen,
    fontWeight: "700",
  },
  upcomingDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minHeight: 84,
  },
  upcomingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  upcomingDoctor: {
    ...typography.bodyBold,
    color: colors.forestGreen,
  },
  upcomingSpecialty: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  upcomingMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upcomingMetaText: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
  },
  upcomingPills: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  upcomingType: {
    ...typography.caption,
    color: colors.textMuted,
  },
  upcomingAction: {
    alignSelf: "flex-start",
  },
  appointmentState: {
    backgroundColor: colors.ivory,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  appointmentStateText: {
    ...typography.caption,
    color: colors.secondaryText,
    textAlign: "center",
  },
  appointmentErrorTitle: {
    ...typography.bodyBold,
    color: colors.forestGreen,
  },
  doctorsSection: {
    gap: spacing.xs,
  },
  doctorList: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    paddingBottom: spacing.sm,
  },
  doctorCard: {
    width: 218,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadows.soft,
  },
  doctorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  doctorCopy: {
    flex: 1,
    gap: 2,
  },
  doctorName: {
    ...typography.bodyBold,
    color: colors.forestGreen,
  },
  doctorSpecialty: {
    ...typography.caption,
    color: colors.primaryGreen,
  },
  experience: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  doctorMeta: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xxs,
  },
  doctorDetails: {
    gap: 2,
  },
  doctorDetailLine: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  doctorDetailText: {
    ...typography.caption,
    color: colors.secondaryText,
    fontSize: 11,
    flexShrink: 1,
  },
  doctorSkeleton: {
    width: 218,
    height: 204,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionError: {
    gap: spacing.sm,
    alignItems: "flex-start",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  pressed: {
    opacity: 0.88,
  },
  bottomNav: {
    minHeight: sizes.tabBar + spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xxs,
  },
  navItem: {
    flex: 1,
    minHeight: sizes.tabBar,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  navIconWrap: {
    minWidth: 36,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  navIconWrapSelected: {
    backgroundColor: colors.lightSage,
  },
  navLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  navLabelSelected: {
    color: colors.forestGreen,
    fontWeight: "700",
  },
});
