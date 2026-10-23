import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, Info, LucideIcon } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type BannerTone = "info" | "warning" | "success";

const TONES: Record<BannerTone, { background: string; text: string; icon: LucideIcon }> = {
  info: { background: colors.infoLight, text: colors.info, icon: Info },
  warning: { background: colors.warningLight, text: colors.warning, icon: AlertTriangle },
  success: { background: colors.successLight, text: colors.success, icon: CheckCircle2 },
};

interface InfoBannerProps {
  message: string;
  title?: string;
  tone?: BannerTone;
}

/** Inline notice for demo-data disclosures, prescription rules and unavailable features. */
export function InfoBanner({ message, title, tone = "info" }: InfoBannerProps) {
  const { background, text, icon: Icon } = TONES[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: background }]}
      accessible
      accessibilityLabel={title ? `${title}. ${message}` : message}
    >
      <Icon size={iconSizes.md} color={text} style={styles.icon} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: text }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: text }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  icon: {
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyBold,
  },
  message: {
    ...typography.body,
    lineHeight: 19,
  },
});
