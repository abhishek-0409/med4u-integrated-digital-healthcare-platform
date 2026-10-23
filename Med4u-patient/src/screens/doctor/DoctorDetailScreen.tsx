import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Building2,
  CalendarClock,
  GraduationCap,
  IndianRupee,
  Languages,
  MapPin,
  ShieldCheck,
  Stethoscope,
  Video,
} from "lucide-react-native";
import { DoctorPortrait } from "../../components/doctor/DoctorPortrait";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { Loader } from "../../components/ui/Loader";
import { RatingDisplay } from "../../components/ui/RatingDisplay";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { doctorService } from "../../services/doctor.service";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { ConsultationMode, TimeSlot } from "../../types/doctor";
import { MainStackParamList } from "../../types/navigation";
import {
  NOT_PROVIDED,
  addClinicDays,
  formatClinicDate,
  formatClinicTime,
  formatExperience,
  formatFee,
  todayInClinic,
} from "../../utils/helpers";
import { StatusBadge } from "../../components/ui/StatusBadge";

type Props = NativeStackScreenProps<MainStackParamList, "DoctorDetail">;

const MODE_LABEL: Record<ConsultationMode, string> = {
  ONLINE: "Video consultation",
  OFFLINE: "In-person visit",
  BOTH: "Video or in-person",
};

const VERIFICATION_METHOD_LABEL: Record<string, string> = {
  NMC_PORTAL_MANUAL: "National Medical Register lookup",
  STATE_COUNCIL_MANUAL: "State Medical Council register lookup",
  HPR_API: "ABDM Healthcare Professionals Registry",
  LICENSED_PROVIDER_API: "licensed verification provider",
};

const LOOKAHEAD_DAYS = 7;
const PREVIEW_SLOTS = 6;

interface NextAvailability {
  date: string;
  slots: TimeSlot[];
}

/** First upcoming day (within the booking window) that still has bookable slots, from the server. */
async function findNextAvailability(doctorId: string): Promise<NextAvailability | null> {
  const today = todayInClinic();
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
    const date = addClinicDays(today, i);
    const slots = (await doctorService.getAvailability(doctorId, date)).filter((s) => s.isAvailable);
    if (slots.length > 0) {
      return { date, slots };
    }
  }
  return null;
}

export function DoctorDetailScreen({ navigation, route }: Props) {
  const { doctorId } = route.params;
  const insets = useSafeAreaInsets();
  const { data: doctor, loading, error, reload } = useAsyncData(() => doctorService.getById(doctorId), [doctorId]);
  const availability = useAsyncData(() => findNextAvailability(doctorId), [doctorId]);

  if (loading) {
    return <Loader />;
  }

  if (error || !doctor) {
    return (
      <ErrorState
        title={error ? undefined : "Doctor not found"}
        message={error ?? "This doctor profile is no longer available."}
        onRetry={error ? reload : undefined}
      />
    );
  }

  const languages = doctor.languages.filter(Boolean);
  const book = () => navigation.navigate("BookDoctor", { doctorId: doctor.id });

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {doctor.isDemo ? (
          <InfoBanner
            title="Demo profile"
            message="This is a fictional demonstration doctor. It is not a real or verified medical professional, and the details below are sample data."
          />
        ) : null}

        {doctor.isStagingFixture ? (
          <InfoBanner
            title="Staging test profile"
            message="This is a fictional doctor created only for testing video consultations. It is not a real or verified medical professional."
          />
        ) : null}

        <View style={styles.hero}>
          <DoctorPortrait
            doctorId={doctor.id}
            uri={doctor.avatarUrl}
            name={doctor.name}
            gender={doctor.gender}
            isDemo={doctor.isDemo}
            width={142}
            height={172}
          />
          <View style={styles.headerText}>
            <Text style={styles.name} accessibilityRole="header">{doctor.name}</Text>
            <Text style={styles.specialization}>{doctor.specialization}</Text>
            <RatingDisplay rating={doctor.rating} reviewCount={doctor.reviewCount} showReviewsLabel />
            {doctor.qualifications.length > 0 ? (
              <Text style={styles.qualificationSummary}>{doctor.qualifications.join(" · ")}</Text>
            ) : null}
            <Text style={styles.experience}>
              {doctor.experienceYears == null
                ? `Experience: ${NOT_PROVIDED}`
                : `${formatExperience(doctor.experienceYears, true)} of experience`}
            </Text>
            {!doctor.isDemo && doctor.isVerified ? <StatusBadge label="Registration verified" tone="success" /> : null}
            {doctor.photoAttribution ? <Text style={styles.attribution}>Photo: {doctor.photoAttribution}</Text> : null}
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat} accessible accessibilityLabel={`Experience: ${formatExperience(doctor.experienceYears, true)}`}>
            <Stethoscope size={iconSizes.md} color={colors.primaryDark} />
            <Text style={styles.statValue}>{formatExperience(doctor.experienceYears)}</Text>
            <Text style={styles.statLabel}>Experience</Text>
          </View>
          <View style={styles.stat} accessible accessibilityLabel={`Consultation fee ${formatFee(doctor.consultationFee)}`}>
            <IndianRupee size={iconSizes.md} color={colors.primaryDark} />
            <Text style={styles.statValue}>{formatFee(doctor.consultationFee)}</Text>
            <Text style={styles.statLabel}>Consultation</Text>
          </View>
          <View style={styles.stat} accessible accessibilityLabel={MODE_LABEL[doctor.consultationMode]}>
            <Video size={iconSizes.md} color={colors.primaryDark} />
            <Text style={styles.statValue} numberOfLines={2}>
              {doctor.consultationMode === "BOTH" ? "Video / visit" : doctor.consultationMode === "ONLINE" ? "Video" : "In person"}
            </Text>
            <Text style={styles.statLabel}>Mode</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.body}>{doctor.bio ?? "No biography provided yet."}</Text>
          <View style={styles.infoRow}>
            <Languages size={iconSizes.sm} color={colors.primaryDark} />
            <Text style={styles.infoText}>{languages.length > 0 ? languages.join(", ") : `Languages: ${NOT_PROVIDED}`}</Text>
          </View>
        </View>

        {doctor.education.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Qualifications</Text>
            {doctor.education.map((entry) => (
              <View key={`${entry.degree}-${entry.year ?? ""}-${entry.institution ?? ""}`} style={styles.infoRow}>
                <GraduationCap size={iconSizes.md} color={colors.primaryDark} />
                <View style={styles.flex}>
                  <Text style={styles.degree}>{entry.degree}</Text>
                  {/* Demo profiles carry placeholder institutions and years; show them only for real data. */}
                  {!doctor.isDemo ? (
                    <Text style={styles.infoText}>
                      {[entry.institution, entry.year].filter(Boolean).join(" · ") || `Institution and year: ${NOT_PROVIDED}`}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {doctor.registration && !doctor.isDemo ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Registration</Text>
            <View style={styles.infoRow}>
              <ShieldCheck size={iconSizes.md} color={colors.primaryDark} />
              <Text style={styles.infoText}>
                {doctor.registration.council} · No. {doctor.registration.number}
                {doctor.registration.year ? ` · registered ${doctor.registration.year}` : ""}
              </Text>
            </View>
            <Text style={styles.infoText}>
              {doctor.verification.status === "verified" && doctor.verification.verifiedAt
                ? `Verified on ${doctor.verification.verifiedAt.slice(0, 10)}${
                    doctor.verification.method
                      ? ` via ${VERIFICATION_METHOD_LABEL[doctor.verification.method] ?? doctor.verification.method}`
                      : ""
                  }.`
                : "Registration not yet verified."}
            </Text>
            {doctor.source ? (
              <Text style={styles.attribution}>
                Profile source: {doctor.source.name}
                {doctor.source.retrievedAt ? ` (retrieved ${doctor.source.retrievedAt})` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}

        {doctor.clinicName || doctor.city || doctor.address ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clinic</Text>
            {doctor.clinicName ? (
              <View style={styles.infoRow}>
                <Building2 size={iconSizes.md} color={colors.primaryDark} />
                <Text style={styles.infoText}>{doctor.clinicName}</Text>
              </View>
            ) : null}
            {doctor.address || doctor.city ? (
              <View style={styles.infoRow}>
                <MapPin size={iconSizes.md} color={colors.primaryDark} />
                <Text style={styles.infoText}>{[doctor.address, doctor.city].filter(Boolean).join(", ")}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available slots</Text>
          {availability.loading ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading availability" />
          ) : availability.error ? (
            <Button title="Couldn't load slots. Try again" variant="secondary" size="sm" fullWidth={false} onPress={availability.reload} />
          ) : availability.data ? (
            <>
              <View style={styles.infoRow}>
                <CalendarClock size={iconSizes.md} color={colors.primaryDark} />
                <Text style={styles.infoText}>Next available: {formatClinicDate(availability.data.date)}</Text>
              </View>
              <View style={styles.slots}>
                {availability.data.slots.slice(0, PREVIEW_SLOTS).map((slot) => (
                  <View key={slot.id} style={styles.slot} accessible accessibilityLabel={`Available at ${formatClinicTime(slot.startTime)}`}>
                    <Text style={styles.slotText}>{formatClinicTime(slot.startTime)}</Text>
                  </View>
                ))}
              </View>
              {availability.data.slots.length > PREVIEW_SLOTS ? (
                <Text style={styles.infoText}>+{availability.data.slots.length - PREVIEW_SLOTS} more times that day</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.body}>No open slots in the next {LOOKAHEAD_DAYS} days.</Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View>
          <Text style={styles.feeCaption}>Consultation fee</Text>
          <Text style={styles.fee}>{formatFee(doctor.consultationFee)}</Text>
        </View>
        <Button
          title="Book appointment"
          fullWidth={false}
          onPress={book}
          disabled={doctor.consultationFee == null}
          style={styles.bookButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerText: {
    width: "100%",
    gap: 4,
    alignItems: "center",
  },
  name: {
    ...typography.h2,
    textAlign: "center",
  },
  specialization: {
    ...typography.title,
    color: colors.primaryDark,
    textAlign: "center",
  },
  qualificationSummary: {
    ...typography.body,
    textAlign: "center",
  },
  experience: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  attribution: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  stats: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  statValue: {
    ...typography.bodyBold,
    textAlign: "center",
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.title,
    marginBottom: spacing.xxs,
  },
  body: {
    ...typography.body,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  infoText: {
    ...typography.body,
    flexShrink: 1,
  },
  degree: {
    ...typography.bodyBold,
  },
  slots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  slot: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.mint,
  },
  slotText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feeCaption: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  fee: {
    ...typography.h3,
  },
  bookButton: {
    flexGrow: 1,
    maxWidth: 240,
  },
});
