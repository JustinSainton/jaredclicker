// Platform-safe haptics wrapper
// iOS/Android: delegates to expo-haptics
// Web: uses navigator.vibrate() or silent no-op
import { Platform } from "react-native";

let ExpoHaptics = null;
if (Platform.OS !== "web") {
  try {
    ExpoHaptics = require("expo-haptics");
  } catch {}
}

// Impact feedback styles (match expo-haptics API)
export const ImpactFeedbackStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
};

// Notification feedback types
export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
};

const VIBRATE_DURATIONS = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: 30,
  warning: 40,
  error: 50,
};

function webVibrate(ms) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch {}
}

export async function impactAsync(style = ImpactFeedbackStyle.Medium) {
  if (ExpoHaptics) {
    try {
      return ExpoHaptics.impactAsync(
        style === "light" ? ExpoHaptics.ImpactFeedbackStyle.Light :
        style === "heavy" ? ExpoHaptics.ImpactFeedbackStyle.Heavy :
        ExpoHaptics.ImpactFeedbackStyle.Medium
      );
    } catch {}
  }
  webVibrate(VIBRATE_DURATIONS[style] || 20);
}

export async function notificationAsync(type = NotificationFeedbackType.Success) {
  if (ExpoHaptics) {
    try {
      return ExpoHaptics.notificationAsync(
        type === "warning" ? ExpoHaptics.NotificationFeedbackType.Warning :
        type === "error" ? ExpoHaptics.NotificationFeedbackType.Error :
        ExpoHaptics.NotificationFeedbackType.Success
      );
    } catch {}
  }
  webVibrate(VIBRATE_DURATIONS[type] || 30);
}

export async function selectionAsync() {
  if (ExpoHaptics) {
    try { return ExpoHaptics.selectionAsync(); } catch {}
  }
  webVibrate(5);
}

// Vibration pattern support (replaces react-native Vibration)
export function vibrate(pattern) {
  if (Platform.OS !== "web") {
    try {
      const { Vibration } = require("react-native");
      Vibration.vibrate(pattern);
    } catch {}
    return;
  }
  webVibrate(typeof pattern === "number" ? pattern : 100);
}
