import React from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, round, space, type } from "../theme/tokens";

export function Field({
  label,
  error,
  hint,
  multiline,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        textAlignVertical={multiline ? "top" : "center"}
      />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  format = (v: T) => v,
  error,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (value: T) => void;
  format?: (value: T) => string;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${format(option)}`}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{format(option)}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

export function MultiChips<T extends string>({
  label,
  options,
  values,
  onChange,
  format = (v: T) => v,
}: {
  label: string;
  options: readonly T[];
  values: T[];
  onChange: (values: T[]) => void;
  format?: (value: T) => string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <Pressable
              key={option}
              onPress={() => onChange(selected ? values.filter((v) => v !== option) : [...values, option])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${label}: ${format(option)}`}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{format(option)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Notice({ tone, children }: { tone: "info" | "warning" | "error" | "success"; children: React.ReactNode }) {
  return (
    <View style={[styles.notice, tone === "warning" && styles.noticeWarning, tone === "error" && styles.noticeError, tone === "success" && styles.noticeSuccess]} accessibilityRole={tone === "error" ? "alert" : undefined}>
      <Text style={[styles.noticeText, tone === "error" && { color: colors.danger }, tone === "warning" && { color: colors.warning }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { ...type.label },
  input: {
    minHeight: 48,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    borderRadius: round.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontSize: 15,
    color: colors.text,
  },
  multiline: { minHeight: 92 },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger },
  hint: { ...type.caption },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: round.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.card, fontWeight: "700" },
  notice: { padding: space.sm, borderRadius: round.md, backgroundColor: colors.sageLight },
  noticeWarning: { backgroundColor: colors.cream },
  noticeError: { backgroundColor: "#FDECEA" },
  noticeSuccess: { backgroundColor: colors.sageLight },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.forest },
});
