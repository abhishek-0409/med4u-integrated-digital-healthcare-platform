import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../../theme/colors";
import { radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

/** "outline" is kept as an alias of "secondary" for existing call sites. */
type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "md" | "sm";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  fullWidth?: boolean;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
}

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.primaryDark,
  outline: colors.primaryDark,
  danger: colors.white,
  ghost: colors.primaryDark,
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  leftIcon,
  fullWidth = true,
  size = "md",
  style,
  disabled,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || loading;
  const labelColor = LABEL_COLOR[variant];

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.baseSm : styles.baseMd,
        variantStyles[variant],
        !fullWidth && styles.inline,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.content}>
          {leftIcon}
          <Text style={[styles.label, size === "sm" && styles.labelSm, { color: labelColor }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function PrimaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button {...props} variant="secondary" />;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  baseMd: {
    minHeight: sizes.buttonMd,
  },
  baseSm: {
    minHeight: sizes.buttonSm,
    paddingHorizontal: spacing.md,
  },
  inline: {
    alignSelf: "flex-start",
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  label: {
    ...typography.button,
  },
  labelSm: {
    fontSize: 14,
    lineHeight: 18,
  },
});

const secondary: ViewStyle = {
  backgroundColor: colors.white,
  borderWidth: 1.25,
  borderColor: colors.primary,
};

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary,
  outline: secondary,
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: "transparent" },
};
