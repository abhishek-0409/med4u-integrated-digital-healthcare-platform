import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../theme/colors";
import { radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface CategoryChipProps {
  label: string;
  selected?: boolean;
  /** "onDark" is for chips placed on the teal hero background. */
  tone?: "default" | "onDark";
  onPress: () => void;
}

/** Single-select filter chip. */
export function CategoryChip({ label, selected = false, tone = "default", onPress }: CategoryChipProps) {
  const onDark = tone === "onDark";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        onDark && styles.chipOnDark,
        selected && (onDark ? styles.selectedOnDark : styles.selected),
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          onDark && styles.labelOnDark,
          selected && (onDark ? styles.labelSelectedOnDark : styles.labelSelected),
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: sizes.chip,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipOnDark: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.55)",
  },
  selectedOnDark: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  pressed: {
    opacity: 0.85,
  },
  labelOnDark: {
    color: colors.white,
  },
  labelSelectedOnDark: {
    color: colors.primaryDark,
    fontWeight: "600",
  },
  label: {
    ...typography.body,
    fontWeight: "500",
    color: colors.text,
  },
  labelSelected: {
    color: colors.white,
    fontWeight: "600",
  },
});
