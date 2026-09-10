/**
 * Classical — design tokens for FindMyCafe.
 * Drop-in replacement for src/constants/theme.ts.
 *
 * Rules the values assume:
 *  - accent is a STROKE color. The only permitted accent fill is accent100.
 *  - accent-colored text at body size uses accent700 (accent itself is 3:1).
 *  - no bold; 600 on Cormorant is the ceiling.
 *  - all figures tabular: fontVariant: ['tabular-nums'].
 */

export const COLORS = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  surfaceAlt: '#f8f4f4',

  text: '#201f1d',
  textSecondary: '#444141',
  textMuted: '#605d5d',
  textLight: '#9b9797',
  inverseText: '#f8f4f4',

  accent: '#b68235',
  accent100: '#fff3e4',
  accent200: '#ffe3bf',
  accent600: '#a06f24',
  accent700: '#7d5411',

  neutral200: '#eae7e7',
  neutral300: '#d7d3d3',
  neutral700: '#605d5d',
  neutral900: '#2d2b2b',

  divider: 'rgba(32,31,29,0.16)',
  hairlineStrong: 'rgba(32,31,29,0.28)',
  scrim: 'rgba(32,31,29,0.42)',

  /** Kept only for destructive copy. The redesign carries no semantic fills. */
  danger: '#b91c1c',
} as const;

export const SPACING = {
  xs: 4.6,
  sm: 9.2,
  md: 13.8,
  lg: 18.4,
  xl: 27.6,
  xxl: 36.8,
  screen: 20,
} as const;

export const RADIUS = { sm: 2, md: 4, lg: 7, full: 9999 } as const;

export const FONTS = {
  displayRegular: 'CormorantGaramond_400Regular',
  display: 'CormorantGaramond_500Medium',
  displaySemi: 'CormorantGaramond_600SemiBold',
  body: 'Lora_400Regular',
  bodyItalic: 'Lora_400Regular_Italic',
  bodyMedium: 'Lora_500Medium',
} as const;

const tnum = { fontVariant: ['tabular-nums' as const] };

export const TYPE = {
  display:      { fontFamily: FONTS.display,        fontSize: 34,   lineHeight: 36, letterSpacing: -0.34 },
  screenTitle:  { fontFamily: FONTS.display,        fontSize: 30,   lineHeight: 30 },
  numeral:      { fontFamily: FONTS.displayRegular, fontSize: 40,   lineHeight: 40, ...tnum },
  cardTitle:    { fontFamily: FONTS.displaySemi,    fontSize: 22,   lineHeight: 25 },
  listTitle:    { fontFamily: FONTS.displaySemi,    fontSize: 19,   lineHeight: 23 },
  sectionValue: { fontFamily: FONTS.display,        fontSize: 24,   lineHeight: 28 },
  body:         { fontFamily: FONTS.body,           fontSize: 14,   lineHeight: 23 },
  bodyTight:    { fontFamily: FONTS.body,           fontSize: 13.5, lineHeight: 20 },
  meta:         { fontFamily: FONTS.body,           fontSize: 12.5, lineHeight: 18, ...tnum },
  metaSmall:    { fontFamily: FONTS.body,           fontSize: 11.5, lineHeight: 16, ...tnum },
  kicker:       { fontFamily: FONTS.body,           fontSize: 11,   lineHeight: 14, letterSpacing: 1.3, textTransform: 'uppercase' as const },
  tab:          { fontFamily: FONTS.body,           fontSize: 10,   lineHeight: 13, letterSpacing: 1.0, textTransform: 'uppercase' as const },
} as const;

/** Elevation is a whisper. Only the route card and map pins get it. */
export const SHADOW = {
  sm: { shadowColor: '#2d2b2b', shadowOpacity: 0.14, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: '#2d2b2b', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
} as const;

export const MOTION = { fast: 200, base: 250, sheet: 280, rise: 14 } as const;

export const CROWD_BANDS = [
  { max: 3,  label: 'Light' },
  { max: 6,  label: 'Half full' },
  { max: 8,  label: 'Busy' },
  { max: 10, label: 'Full' },
] as const;

export const crowdLabel = (n: number) =>
  (CROWD_BANDS.find(b => n <= b.max) ?? CROWD_BANDS[3]).label;

export const THEME = { colors: COLORS, spacing: SPACING, radius: RADIUS, fonts: FONTS, type: TYPE, shadow: SHADOW, motion: MOTION };
export default THEME;
