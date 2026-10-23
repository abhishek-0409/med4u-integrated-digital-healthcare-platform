import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { radius, shadows, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  leftElement?: React.ReactNode;
  error?: string;
}

/** Dropdown: a field that opens a list in a modal. Behaves the same on Android, iOS and web. */
export function SelectField<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  leftElement,
  error,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, error ? styles.fieldError : null]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? "Not selected" }}
        accessibilityHint="Opens a list of options"
      >
        {leftElement ? <View style={styles.left}>{leftElement}</View> : null}
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={20} color={colors.forestGreen} />
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close list">
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(option) => option.value}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={[styles.option, active && styles.optionActive]}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.label}</Text>
                    {active ? <Check size={18} color={colors.forestGreen} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xxs },
  label: { ...typography.bodyBold, color: colors.mainText },
  field: {
    minHeight: sizes.input,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  fieldError: { borderColor: colors.danger },
  left: { marginRight: spacing.sm },
  value: { flex: 1, ...typography.title, fontWeight: "500", color: colors.text },
  placeholder: { color: colors.textSubtle, fontWeight: "400" },
  error: { ...typography.caption, color: colors.danger },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "70%",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    ...shadows.raised,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.forestGreen,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  option: {
    minHeight: sizes.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  optionActive: { backgroundColor: colors.lightSage },
  optionText: { ...typography.title, fontWeight: "500", color: colors.text },
  optionTextActive: { color: colors.forestGreen, fontWeight: "700" },
});
