import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/spacing";

interface DoctorPortraitProps {
  doctorId: string;
  uri?: string | null;
  name: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  isDemo?: boolean;
  width: number;
  height: number;
}

const DEMO_PORTRAITS = {
  female: [
    require("../../assets/doctors/demo-female-1.jpg"),
    require("../../assets/doctors/demo-female-2.jpg"),
  ],
  male: [
    require("../../assets/doctors/demo-male-1.jpg"),
    require("../../assets/doctors/demo-male-2.jpg"),
  ],
} as const;

const initialOf = (name: string) =>
  (
    name
      .replace(/^dr\.?\s+/i, "")
      .trim()
      .charAt(0) || "?"
  ).toUpperCase();

/** Uses API photos first; generated portraits are used only for known-gender demo records. */
export function DoctorPortrait({
  doctorId,
  uri,
  name,
  gender,
  isDemo,
  width,
  height,
}: DoctorPortraitProps) {
  const [loaded, setLoaded] = useState(false);
  const [remoteFailed, setRemoteFailed] = useState(!uri);
  const [localFailed, setLocalFailed] = useState(false);

  const demoPortraits =
    isDemo && (gender === "male" || gender === "female")
      ? DEMO_PORTRAITS[gender]
      : null;
  const portraitIndex =
    doctorId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2;
  const localSource = demoPortraits?.[portraitIndex] ?? null;
  const source =
    uri && !remoteFailed
      ? { uri }
      : localSource && !localFailed
        ? localSource
        : null;

  useEffect(() => {
    setLoaded(false);
    setRemoteFailed(!uri);
    setLocalFailed(false);
  }, [uri, doctorId, gender, isDemo]);

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessibilityLabel={`${name} portrait`}
    >
      {!source ? (
        <View style={styles.fallback}>
          <Text
            style={[
              styles.initial,
              { fontSize: Math.min(width, height) * 0.38 },
            ]}
          >
            {initialOf(name)}
          </Text>
        </View>
      ) : (
        <>
          {!loaded ? (
            <ActivityIndicator
              style={StyleSheet.absoluteFill}
              color={colors.primary}
            />
          ) : null}
          <Image
            source={source}
            style={[styles.image, { opacity: loaded ? 1 : 0 }]}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              if (uri && !remoteFailed) setRemoteFailed(true);
              else setLocalFailed(true);
            }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${isDemo && !uri && source === localSource ? "Illustrative demo portrait" : "Portrait"} for ${name}`}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontWeight: "700",
    color: colors.primaryDark,
  },
});
