import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

/** One teardrop leaf growing from the origin upwards; rotated copies form the Med4U mark. */
const LEAF = "M0 0 C-9 -8 -9 -22 0 -30 C9 -22 9 -8 0 0 Z";

export function LeafMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-34 -34 68 68" accessibilityElementsHidden>
      <Path d={LEAF} fill={colors.forestGreen} transform="rotate(-45)" />
      <Path d={LEAF} fill={colors.primaryGreen} transform="rotate(45)" />
      <Path d={LEAF} fill={colors.sageGreen} transform="rotate(135)" />
      <Path d={LEAF} fill={colors.forestGreen} transform="rotate(225)" />
    </Svg>
  );
}

interface BrandLogoProps {
  size?: number;
  showTagline?: boolean;
}

export function BrandLogo({ size = 56, showTagline = true }: BrandLogoProps) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel="Med4U, Your Health, Our Care">
      <LeafMark size={size} />
      <Text style={styles.name}>Med4U</Text>
      {showTagline ? <Text style={styles.tagline}>Your Health, Our Care</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  name: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: colors.forestGreen,
    marginTop: 4,
  },
  tagline: { ...typography.caption, color: colors.secondaryText },
});
