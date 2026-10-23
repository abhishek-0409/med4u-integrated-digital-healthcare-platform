import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays, MapPin, Video } from "lucide-react-native";
import { DoctorPortrait } from "./DoctorPortrait";
import { Button } from "../ui/Button";
import { RatingDisplay } from "../ui/RatingDisplay";
import { StatusBadge } from "../ui/StatusBadge";
import { Doctor } from "../../types/doctor";
import { colors } from "../../theme/colors";
import { iconSizes, radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { formatExperience, formatFee } from "../../utils/helpers";

interface DoctorCardProps {
  doctor: Doctor;
  onPress?: () => void;
  onBookNow?: () => void;
}

/** Only genuinely verified doctors get a "Verified" mark; seeded demo profiles are labelled as such. */
export function DoctorBadge({ doctor }: { doctor: Doctor }) {
  if (doctor.isDemo) {
    return <StatusBadge label="Demo profile" tone="info" />;
  }
  if (doctor.isStagingFixture) {
    return <StatusBadge label="Staging test profile" tone="warning" />;
  }
  if (doctor.isVerified) {
    return <StatusBadge label="Verified" tone="success" />;
  }
  return null;
}

export function DoctorCard({ doctor, onPress, onBookNow }: DoctorCardProps) {
  const qualifications = doctor.qualifications.join(", ");

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.infoWrap, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${doctor.name}, ${doctor.specialization}, experience ${formatExperience(doctor.experienceYears, true)}, fee ${formatFee(doctor.consultationFee)}. Open profile.`}
      >
        <DoctorPortrait
          doctorId={doctor.id}
          uri={doctor.avatarUrl}
          name={doctor.name}
          gender={doctor.gender}
          isDemo={doctor.isDemo}
          width={76}
          height={92}
        />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {doctor.name}
          </Text>
          <Text style={styles.spec} numberOfLines={1}>
            {doctor.specialization}
            {doctor.experienceYears ? ` · ${formatExperience(doctor.experienceYears)}` : ""}
          </Text>
          {qualifications ? (
            <Text style={styles.meta} numberOfLines={1}>
              {qualifications}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <RatingDisplay rating={doctor.rating} reviewCount={doctor.reviewCount} />
            {doctor.city ? (
              <View style={styles.metaRow}>
                <MapPin size={iconSizes.xs} color={colors.textSubtle} />
                <Text style={styles.meta} numberOfLines={1}>
                  {doctor.city}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <CalendarDays size={iconSizes.xs} color={doctor.isAvailableToday ? colors.primary : colors.textSubtle} />
              <Text style={[styles.statusText, doctor.isAvailableToday && styles.available]}>
                {doctor.isAvailableToday ? "Available today" : "View available slots"}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Video size={iconSizes.xs} color={colors.textSubtle} />
              <Text style={styles.statusText} numberOfLines={1}>
                {doctor.consultationMode === "BOTH" ? "Online & in person" : doctor.consultationMode === "ONLINE" ? "Online" : "In person"}
              </Text>
            </View>
          </View>
          <DoctorBadge doctor={doctor} />
        </View>
      </Pressable>

      <View style={styles.footer}>
        <View>
          <Text style={styles.feeCaption}>Consultation fee</Text>
          <Text style={styles.fee}>{formatFee(doctor.consultationFee)}</Text>
        </View>
        <View style={styles.actions}>
          <Button
            title="Profile"
            size="sm"
            fullWidth={false}
            variant="secondary"
            onPress={onPress}
            accessibilityLabel={`View ${doctor.name}'s profile`}
          />
          <Button
            title="Book"
            size="sm"
            fullWidth={false}
            onPress={onBookNow ?? onPress}
            disabled={doctor.consultationFee == null}
            accessibilityLabel={`Book appointment with ${doctor.name}`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.sm,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.9,
  },
  infoWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyBold,
  },
  spec: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: spacing.sm,
    gap: 4,
  },
  meta: {
    ...typography.caption,
    color: colors.textSubtle,
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 2,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  available: {
    color: colors.primary,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  feeCaption: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  fee: {
    ...typography.title,
    color: colors.text,
  },
});
