import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, Video } from "lucide-react-native";
import { DoctorPortrait } from "../doctor/DoctorPortrait";
import { ConsultationCredentials } from "../../services/consultation.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export interface VideoCallProps {
  appointmentId: string;
  displayName: string;
  doctorName: string;
  doctorSpecialization: string;
  doctorId: string;
  doctorAvatarUrl?: string | null;
  doctorGender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  doctorIsDemo?: boolean;
  isPatient: boolean;
  credentials: ConsultationCredentials;
  onExit: () => void;
}

/** Browser calls are intentionally unavailable until a browser WebRTC transport is configured. */
export function VideoCall({ onExit, doctorId, doctorAvatarUrl, doctorGender, doctorIsDemo, doctorName, doctorSpecialization, displayName }: VideoCallProps) {
  return (
    <View style={styles.container}>
      <View style={styles.doctorCard}>
        <DoctorPortrait
          doctorId={doctorId}
          uri={doctorAvatarUrl}
          name={doctorName}
          gender={doctorGender}
          isDemo={doctorIsDemo}
          width={48}
          height={48}
        />
        <View style={styles.details}>
          <Text style={styles.doctorName}>{doctorName}</Text>
          <Text style={styles.meta}>{doctorSpecialization}</Text>
          <Text style={styles.meta}>Consultation with {displayName}</Text>
        </View>
      </View>
      <View style={styles.videoArea}>
        <View style={styles.videoIcon}><Video color={colors.lightSage} size={32} /></View>
        <Text style={styles.title}>Video calls need the Med4U mobile app</Text>
        <Text style={styles.message}>
        This app uses native camera and microphone access for consultations. Open this appointment
        in the iOS or Android development build to start a call.
        </Text>
      </View>
      <Pressable onPress={onExit} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Return to appointment">
        <ArrowLeft color={colors.white} size={18} />
        <Text style={styles.buttonText}>Return to appointment</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  doctorCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: spacing.md },
  details: { flex: 1, gap: 2 },
  doctorName: { ...typography.title, color: colors.primaryDark },
  meta: { ...typography.caption, color: colors.textMuted },
  videoArea: { flex: 1, minHeight: 240, borderRadius: 20, backgroundColor: colors.forestGreen, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  videoIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryGreen },
  title: { ...typography.h3, color: colors.white, textAlign: "center" },
  message: { ...typography.body, color: colors.lightSage, textAlign: "center" },
  button: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { opacity: 0.82 },
  buttonText: { ...typography.bodyBold, color: colors.white },
});
