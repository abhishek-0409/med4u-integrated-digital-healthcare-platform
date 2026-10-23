import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { radius, shadows, spacing } from "../../theme/spacing";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadows.soft,
} as const;

const styles = StyleSheet.create({
  card: cardStyle,
});
