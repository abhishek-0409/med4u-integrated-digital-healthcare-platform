/** Med4U light theme palette. Semantic aliases keep existing screens token-driven. */
export const colors = {
  // Reference palette
  forestGreen: "#173D32",
  deepForest: "#102C25",
  primaryGreen: "#285C49",
  sageGreen: "#A8BDA0",
  lightSage: "#E3EBDD",
  warmCream: "#F5F0E8",
  ivory: "#FCFAF6",
  cardWhite: "#FFFFFF",
  mainText: "#24352D",
  secondaryText: "#69766D",
  borders: "#E4E7DF",

  // Surfaces
  background: "#FCFAF6",
  backgroundElevated: "#F5F0E8",
  card: "#FFFFFF",
  inputBackground: "#FFFFFF",
  border: "#E4E7DF",
  borderStrong: "#CCD6CC",

  // Brand and selection states
  primary: "#285C49",
  primaryDark: "#173D32",
  primaryLight: "#A8BDA0",
  secondary: "#A8BDA0",
  mint: "#E3EBDD",
  chip: "#F5F0E8",
  aqua: "#E3EBDD",
  darkCard: "#102C25",

  // Text
  text: "#24352D",
  textMuted: "#69766D",
  textSubtle: "#69766D",

  white: "#FFFFFF",

  // Status
  success: "#285C49",
  successLight: "#E3EBDD",
  warning: "#805313",
  warningLight: "#F5F0E8",
  danger: "#B42318",
  dangerLight: "#FDECEA",
  info: "#285C49",
  infoLight: "#E3EBDD",
  /** Star colour; decorative, never the only carrier of meaning. */
  star: "#B7791F",

  shadow: "#102C25",
  overlay: "rgba(16, 44, 37, 0.5)",
  skeleton: "#E3EBDD",
} as const;

export const gradients = {
  page: [colors.ivory, colors.ivory, colors.ivory],
  hero: [colors.forestGreen, colors.deepForest],
  cta: [colors.primaryGreen, colors.forestGreen],
} as const;
