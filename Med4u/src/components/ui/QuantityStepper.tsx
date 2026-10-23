import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { iconSizes, radius, sizes } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  /** Used in screen-reader labels, e.g. "Dolo 650 Tablet". */
  itemName: string;
  onChange: (next: number) => void;
}

export function QuantityStepper({ value, min = 1, max, itemName, onChange }: QuantityStepperProps) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`Quantity of ${itemName}`} accessibilityValue={{ min, max, now: value }}>
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={!canDecrease}
        style={[styles.button, !canDecrease && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`Decrease quantity of ${itemName}`}
        accessibilityState={{ disabled: !canDecrease }}
      >
        <Minus size={iconSizes.md} color={colors.primaryDark} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={!canIncrease}
        style={[styles.button, !canIncrease && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity of ${itemName}`}
        accessibilityState={{ disabled: !canIncrease }}
      >
        <Plus size={iconSizes.md} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  button: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  value: {
    ...typography.title,
    minWidth: 36,
    textAlign: "center",
  },
});
