import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import {
  Activity,
  Bandage,
  Droplets,
  HeartPulse,
  LucideIcon,
  Package,
  Pill,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react-native";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/spacing";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Pain & Fever": Thermometer,
  Allergy: Wind,
  "Digestive Health": Pill,
  "Oral Rehydration": Droplets,
  "Vitamins & Supplements": Sparkles,
  "Skin Care": Droplets,
  "Cough & Cold": Wind,
  "First Aid": Bandage,
  "Medical Supplies": Activity,
  "Chronic Care": HeartPulse,
};

interface MedicineThumbProps {
  imageUrl: string | null;
  category: string;
  size?: number;
}

/** Product photo when one exists and loads; otherwise a consistent category icon tile. */
export function MedicineThumb({ imageUrl, category, size = 72 }: MedicineThumbProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const Icon = CATEGORY_ICONS[category] ?? Package;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <View style={[styles.tile, styles.imageFrame, { width: size, height: size }]}>
        {!loaded ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} /> : null}
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { opacity: loaded ? 1 : 0 }]}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return (
    <View style={[styles.tile, styles.placeholder, { width: size, height: size }]} accessibilityElementsHidden>
      <Icon size={Math.round(size * 0.42)} color={colors.primaryDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
    overflow: "hidden",
  },
  imageFrame: {
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
});
