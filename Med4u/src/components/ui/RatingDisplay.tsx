import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Star } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { iconSizes } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface RatingDisplayProps {
  rating: number;
  reviewCount: number;
  showReviewsLabel?: boolean;
}

/**
 * Renders only when genuine reviews exist. A rating with zero reviews is "no data", not a score,
 * so nothing is shown rather than a made-up or empty rating.
 */
export function RatingDisplay({ rating, reviewCount, showReviewsLabel = false }: RatingDisplayProps) {
  if (reviewCount <= 0 || rating <= 0) {
    return null;
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Rated ${rating.toFixed(1)} out of 5 from ${reviewCount} reviews`}
    >
      <Star size={iconSizes.sm} color={colors.star} fill={colors.star} />
      <Text style={styles.text}>
        {rating.toFixed(1)} ({reviewCount}{showReviewsLabel ? " reviews" : ""})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  text: {
    ...typography.caption,
    color: colors.text,
  },
});
