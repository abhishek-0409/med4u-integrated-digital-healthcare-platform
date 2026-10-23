import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Button } from "./Button";
import { colors } from "../../theme/colors";
import { iconSizes, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={iconSizes.xl} color={colors.danger} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.message} accessibilityLiveRegion="polite">
        {message}
      </Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} fullWidth={false} size="sm" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.xs,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
});
