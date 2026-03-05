import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Light, white-based modern design system.
 * Clean backgrounds, soft shadows, one accent – works on all phone sizes.
 */
export const tokens = {
  colors: {
    // Base – white and light grays
    bg: '#FFFFFF',
    bgSecondary: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceOverlay: '#F1F5F9',

    // Borders – light and subtle
    border: '#E2E8F0',
    borderDark: '#CBD5E1',

    // Text – dark on light
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',

    // Brand accent – one vibrant color (coral-rose for a fresh, modern feel)
    accent: '#E11D48',
    accentDim: 'rgba(225, 29, 72, 0.12)',
    accentPressed: '#BE123C',

    // Semantic
    pink: '#F472B6',
    green: '#10B981',
    greenBorder: '#059669',
    blue: '#0EA5E9',
    blueBorder: '#0284C7',
    gray: '#64748B',
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
  },

  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
    screenHorizontal: Math.min(24, SCREEN_WIDTH * 0.06),
  },

  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
    full: 9999,
  },

  typography: {
    titleLarge: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
    titleSmall: { fontSize: 17, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
    label: { fontSize: 13, fontWeight: '600' },
    button: { fontSize: 16, fontWeight: '600' },
  },

  shadow: {
    color: '#000000',
    offsetSm: { width: 0, height: 1 },
    offsetMd: { width: 0, height: 2 },
    opacity: 0.06,
    radius: 8,
    elevation: 3,
    elevationHigh: 8,
  },

  font: {
    heavy: '700',
    bold: '600',
    semi: '600',
  },

  isSmallDevice: SCREEN_WIDTH < 375,
  maxContentWidth: 440,
};

// Expo Router: file under app/ must have default export (config, not a route).
export default function TokensRoute() {
  return null;
}
