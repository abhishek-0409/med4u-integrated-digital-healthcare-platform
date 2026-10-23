import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { layout, spacing } from "../../theme/spacing";

interface ScreenProps {
  children: React.ReactNode;
  /** Apply the standard side padding. Disable when a child list manages its own padding. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Page background plus a centred, width-capped content column (tablet / web friendly). */
export function Screen({ children, padded = true, style }: ScreenProps) {
  return (
    <View style={styles.root}>
      <View style={[styles.column, padded && styles.padded, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxContentWidth,
  },
  padded: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
});
