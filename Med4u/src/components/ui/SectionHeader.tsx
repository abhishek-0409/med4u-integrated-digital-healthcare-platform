import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel}: ${title}`}
          style={styles.action}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sizes.touchTarget - 8,
    marginTop: spacing.md,
  },
  title: {
    ...typography.h3,
    flexShrink: 1,
  },
  action: {
    minHeight: sizes.touchTarget - 8,
    justifyContent: "center",
    paddingLeft: spacing.sm,
  },
  actionText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
});
