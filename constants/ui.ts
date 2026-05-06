import { Platform } from "react-native";

export const palette = {
  background: "#F5F6F8",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F3F5",
  border: "#E8EAED",
  text: "#1F2933",
  textMuted: "#6B7280",
  textSoft: "#9AA3AF",
  primary: "#FF8216",
  primarySoft: "#FFF2E6",
  accent: "#FED96E",
  accentSoft: "#FFF8DC",
  success: "#34A853",
  successSoft: "#EAF7EE",
  danger: "#E53935",
  dangerSoft: "#FDECEC",
  warning: "#F59E0B",
  warningSoft: "#FFF7E6",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: "#111827",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
    },
    android: {
      elevation: 3,
    },
    default: {
      shadowColor: "#111827",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 3,
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: "#111827",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
    },
    android: {
      elevation: 2,
    },
    default: {
      shadowColor: "#111827",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
  }),
};

export const formatCurrency = (amount: number) => `RM ${amount.toFixed(2)}`;
