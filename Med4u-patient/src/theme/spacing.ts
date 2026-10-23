/** Med4U design tokens: spacing, radius, elevation, component sizes and layout. */
import { colors } from "./colors";

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const shadows = {
  /** Resting cards: a hairline lift, not a floating look. */
  soft: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  /** Floating controls (cart bar, sticky actions). */
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const sizes = {
  /** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
  touchTarget: 44,
  buttonMd: 48,
  buttonSm: 40,
  input: 52,
  searchBar: 48,
  chip: 36,
  tabBar: 44,
  avatarSm: 40,
  avatarMd: 56,
  avatarLg: 88,
  thumbnail: 72,
} as const;

export const iconSizes = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
} as const;

export const layout = {
  screenPadding: 20,
  /** Content is centred and capped on wide screens (tablet / web). */
  maxContentWidth: 640,
} as const;
