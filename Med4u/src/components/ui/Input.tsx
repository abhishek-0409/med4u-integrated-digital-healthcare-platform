import React, { useState } from "react";
import {
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../../theme/colors";
import { radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface InputProps {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  maxLength?: number;
  rightElement?: React.ReactNode;
  /** Icon or element shown before the text, inside the field. */
  leftElement?: React.ReactNode;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  /** Validation message shown under the field. */
  error?: string;
  /** Helper text shown under the field when there is no error. */
  hint?: string;
  multiline?: boolean;
  numberOfLines?: number;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  onBlur?: () => void;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Labelled text field (FormInput). The label is also the screen-reader label. */
export function Input({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType = "default",
  autoCapitalize,
  secureTextEntry = false,
  maxLength,
  rightElement,
  leftElement,
  autoComplete,
  textContentType,
  error,
  hint,
  multiline = false,
  numberOfLines,
  returnKeyType,
  onSubmitEditing,
  onBlur,
  editable = true,
  style,
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          isFocused && styles.inputWrapFocused,
          error ? styles.inputWrapError : null,
          !editable && styles.inputWrapDisabled,
        ]}
      >
        {leftElement ? <View style={styles.left}>{leftElement}</View> : null}
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? "top" : "center"}
          returnKeyType={returnKeyType ?? (multiline ? "default" : "done")}
          blurOnSubmit={!multiline}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          autoComplete={autoComplete}
          textContentType={textContentType}
          style={[styles.input, multiline && styles.inputMultiline]}
          accessibilityLabel={label}
        />
        {rightElement}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export const FormInput = Input;

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xxs,
  },
  label: {
    ...typography.label,
  },
  inputWrap: {
    minHeight: sizes.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBackground,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  left: {
    marginRight: spacing.sm,
  },
  inputWrapMultiline: {
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
  },
  inputWrapFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputWrapError: {
    borderColor: colors.danger,
  },
  inputWrapDisabled: {
    backgroundColor: colors.chip,
  },
  input: {
    flex: 1,
    ...typography.title,
    fontWeight: "500",
    color: colors.text,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  hint: {
    ...typography.caption,
    color: colors.textSubtle,
  },
});
