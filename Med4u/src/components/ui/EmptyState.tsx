import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Inbox, LucideIcon } from "lucide-react-native";
import { Button } from "./Button";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

/** Inline "nothing here" block (unlike ErrorState, it does not fill the screen). */
export function EmptyState({ title, message, icon: Icon = Inbox, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={message ? `${title}. ${message}` : title}>
      <View style={styles.iconWrap}>
        <Icon size={iconSizes.xl} color={colors.primaryDark} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} size="sm" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    textAlign: "center",
  },
  action: {
    marginTop: spacing.xs,
    alignSelf: "center",
  },
});
