import { TextStyle } from "react-native";
import { colors } from "./colors";

/** Font sizes in dp. Body copy never goes below 14; 12 is reserved for captions and badges. */
export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

type Typography = {
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  title: TextStyle;
  body: TextStyle;
  bodyBold: TextStyle;
  caption: TextStyle;
  label: TextStyle;
  button: TextStyle;
};

export const typography: Typography = {
  h1: {
    fontSize: fontSizes.xxl,
    lineHeight: 34,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: fontSizes.xl,
    lineHeight: 28,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: fontSizes.lg,
    lineHeight: 24,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  title: {
    fontSize: fontSizes.md,
    lineHeight: 22,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  body: {
    fontSize: fontSizes.sm,
    lineHeight: 21,
    fontWeight: fontWeights.regular,
    color: colors.textMuted,
  },
  bodyBold: {
    fontSize: fontSizes.sm,
    lineHeight: 21,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  caption: {
    fontSize: fontSizes.xs,
    lineHeight: 17,
    fontWeight: fontWeights.medium,
    color: colors.textMuted,
  },
  label: {
    fontSize: fontSizes.sm,
    lineHeight: 18,
    fontWeight: fontWeights.medium,
    color: colors.textMuted,
  },
  button: {
    fontSize: fontSizes.md,
    lineHeight: 20,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
};
