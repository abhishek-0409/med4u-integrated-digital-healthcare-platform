import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const STEPS = ["Basic Details", "Health Info", "Complete"] as const;

/** Three-step progress: completed steps are sage with a tick, the current step forest green. */
export function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Step ${current} of ${STEPS.length}: ${STEPS[current - 1]}`}
    >
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={label}>
            {index > 0 ? <View style={[styles.line, step <= current && styles.lineDone]} /> : null}
            <View style={styles.item}>
              <View style={[styles.circle, done && styles.circleDone, active && styles.circleActive]}>
                {done ? (
                  <Check size={14} color={colors.forestGreen} strokeWidth={3} />
                ) : (
                  <Text style={[styles.number, active && styles.numberActive]}>{step}</Text>
                )}
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const CIRCLE = 28;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  item: { alignItems: "center", width: 84, gap: spacing.xxs },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.lightSage,
  },
  circleDone: { backgroundColor: colors.sageGreen },
  circleActive: { backgroundColor: colors.forestGreen },
  number: { ...typography.caption, fontWeight: "700", color: colors.secondaryText },
  numberActive: { color: colors.white },
  line: {
    flex: 1,
    height: 2,
    marginTop: CIRCLE / 2 - 1,
    marginHorizontal: -spacing.xs,
    backgroundColor: colors.lightSage,
  },
  lineDone: { backgroundColor: colors.sageGreen },
  label: { ...typography.caption, fontSize: 11, color: colors.secondaryText, textAlign: "center" },
  labelActive: { color: colors.forestGreen, fontWeight: "700" },
});
