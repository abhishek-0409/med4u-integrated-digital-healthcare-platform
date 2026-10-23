/** Shared Med4U light-theme values, copied to keep this app independent. */
export const colors = {
  forest: "#173D32",
  forestDeep: "#102C25",
  green: "#285C49",
  sage: "#A8BDA0",
  sageLight: "#E3EBDD",
  cream: "#F5F0E8",
  background: "#FCFAF6",
  card: "#FFFFFF",
  text: "#24352D",
  muted: "#69766D",
  border: "#E4E7DF",
  danger: "#B42318",
  warning: "#805313",
  success: "#285C49",
} as const;

export const space = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const round = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, color: colors.text },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const, color: colors.text },
} as const;
