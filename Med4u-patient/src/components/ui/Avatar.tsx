import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/spacing";

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

/** First letter of the name, ignoring a leading "Dr." title. */
const initialOf = (name: string): string =>
  (name.replace(/^dr\.?\s+/i, "").trim().charAt(0) || "?").toUpperCase();

/** Photo when available and loadable, otherwise a neutral initial. Never throws on a bad URL. */
export function Avatar({ uri, name = "User", size = 46 }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size }]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size }]} accessibilityElementsHidden>
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.38) }]}>{initialOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.pill,
    backgroundColor: colors.skeleton,
  },
  fallback: {
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
});
