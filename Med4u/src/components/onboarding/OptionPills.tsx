import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface OptionPillsProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
}

/** Single-choice pills (e.g. gender). Selected is forest green; the rest are white with a hairline border. */
export function OptionPills<T extends string>({ label, options, value, onChange, error }: OptionPillsProps<T>) {
  return (
    <View style={styles.wrapper} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.pill, active && styles.pillActive]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.text, active && styles.textActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { ...typography.bodyBold, color: colors.mainText },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    minHeight: sizes.touchTarget,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pillActive: { backgroundColor: colors.forestGreen, borderColor: colors.forestGreen },
  text: { ...typography.bodyBold, color: colors.mainText },
  textActive: { color: colors.white },
  error: { ...typography.caption, color: colors.danger },
});
