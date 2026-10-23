import React, { useEffect, useRef } from "react";
import { Animated, DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { cardStyle } from "./Card";

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/** One pulsing placeholder shape. Purely decorative: hidden from screen readers. */
export function SkeletonBlock({ width = "100%", height = 14, borderRadius = radius.xs, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: colors.skeleton, opacity }, style]} />;
}

type SkeletonVariant = "doctor" | "medicine" | "row";

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  /** Number of placeholder cards. */
  count?: number;
}

/** Placeholder cards shaped like the real ones, so the layout does not jump when data arrives. */
export function LoadingSkeleton({ variant = "row", count = 4 }: LoadingSkeletonProps) {
  return (
    <View
      style={styles.list}
      accessible
      accessibilityLabel="Loading"
      accessibilityLiveRegion="polite"
      importantForAccessibility="yes"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width={variant === "doctor" ? 56 : 72} height={variant === "doctor" ? 56 : 72} borderRadius={variant === "doctor" ? radius.pill : radius.md} />
          <View style={styles.lines}>
            <SkeletonBlock width="70%" height={16} />
            <SkeletonBlock width="45%" />
            <SkeletonBlock width="60%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  card: {
    ...cardStyle,
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  lines: {
    flex: 1,
    gap: spacing.xs,
  },
});
