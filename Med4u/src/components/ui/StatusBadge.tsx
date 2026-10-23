import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  success: { background: colors.successLight, text: colors.success },
  warning: { background: colors.warningLight, text: colors.warning },
  danger: { background: colors.dangerLight, text: colors.danger },
  info: { background: colors.infoLight, text: colors.info },
  neutral: { background: colors.chip, text: colors.textMuted },
  primary: { background: colors.mint, text: colors.primaryDark },
};

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

/** Small status pill. Meaning is always carried by the text, never by colour alone. */
export function StatusBadge({ label, tone = "neutral", icon }: StatusBadgeProps) {
  const { background, text } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: background }]} accessible accessibilityLabel={label}>
      {icon}
      <Text style={[styles.text, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  text: {
    ...typography.caption,
    fontWeight: "600",
  },
});
