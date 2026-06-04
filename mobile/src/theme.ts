// Shared design tokens for the mobile app.
// Mirrors frontend/src/index.css "Forest Glass" palette (emerald + gold)
// so web and mobile feel like the same product.

export const colors = {
  // Surfaces
  background: '#f4f7f1',     // emerald-tinted page background (matches web --background)
  surface: '#ffffff',         // card / sheet background
  surfaceMuted: '#eef3ea',    // subtle wash for inputs / chips
  border: '#dfe5d8',
  borderStrong: '#c8d2bd',

  // Text
  text: '#10241a',            // primary text  (matches web --foreground)
  textSecondary: '#52604e',
  textMuted: '#7a8276',
  textInverse: '#ffffff',

  // Brand — emerald (forest)
  primary: '#1f7a3f',         // emerald-500 equivalent — matches web --primary
  primaryDark: '#155a2b',     // emerald-700
  primaryDeep: '#0d3d1d',     // emerald-900
  primarySoft: '#e6f1e8',     // emerald-50
  primaryTint: '#d2e7d6',     // emerald-100

  // Accent — gold (CTA / highlights)
  gold: '#e8b53d',            // matches web --secondary
  goldDark: '#c89320',
  goldSoft: '#fef3d1',

  // Semantic
  success: '#1f7a3f',
  warning: '#b27a00',
  warningSoft: '#fff4d6',
  danger: '#b3261e',
  dangerSoft: '#fde2e0',
  info: '#1d4ed8',
  infoSoft: '#e0e9ff',

  // Overlay
  overlay: 'rgba(13, 61, 29, 0.5)',
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  // Sizes scale from web's Tailwind text-* defaults
  display: { fontSize: 28, fontWeight: '900' as const, lineHeight: 34 },
  title:   { fontSize: 22, fontWeight: '900' as const, lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: '800' as const, lineHeight: 24 },
  subheading: { fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  body:    { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: '700' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  micro:   { fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
};

export const shadows = {
  card: {
    shadowColor: '#0d3d1d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#0d3d1d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
} as const;

// Legacy alias — older screens import `tokens.*`. Keep them working
// while we migrate to the richer palette above.
export const tokens = {
  background: colors.background,
  surface: colors.surface,
  border: colors.border,
  text: colors.text,
  mutedText: colors.textMuted,
  accent: colors.primary,
  accentSoft: colors.primarySoft,
  danger: colors.danger,
  warning: colors.warning,
};

export const theme = { colors, radii, spacing, typography, shadows };
export type Theme = typeof theme;
