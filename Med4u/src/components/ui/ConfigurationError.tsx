import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function ConfigurationError() {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Med4U needs its API address</Text>
        <Text style={styles.message}>
          This build is missing EXPO_PUBLIC_API_URL. Set it to the Med4U backend URL and rebuild the app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.card,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.textSubtle,
  },
});
