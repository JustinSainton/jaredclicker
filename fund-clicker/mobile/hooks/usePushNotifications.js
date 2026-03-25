// Push Notifications — register for Expo Push, handle incoming notifications,
// subscribe token to backend per-org, handle tap-to-navigate
import { useState, useEffect, useRef, useCallback } from "react";
import { Platform, AppState } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";

// Load expo-notifications only on native (crashes on web)
let Notifications = null;
let Constants = null;
if (Platform.OS !== "web") {
  try {
    Notifications = require("expo-notifications");
    Constants = require("expo-constants");
    // Configure notification behavior when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data;
        const alwaysShow = ["challenge", "sabotage", "coincut", "battle_win", "battle_loss", "campaign", "podium", "admin", "chat_mention"];
        const shouldShow = alwaysShow.includes(data?.category);
        return {
          shouldShowAlert: shouldShow,
          shouldPlaySound: shouldShow,
          shouldSetBadge: true,
          shouldShowBanner: shouldShow,
        };
      },
    });
  } catch {}
}

export default function usePushNotifications(orgSlug, playerName, playerToken = null) {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  // Web: push notifications not supported (would need Web Push API + service worker)
  if (Platform.OS === "web" || !Notifications) {
    return { expoPushToken: null, notification: null };
  }
  const router = useRouter();
  const registered = useRef(false);

  // Register for push notifications
  const registerForPush = useCallback(async () => {
    if (!Constants.isDevice) {
      // Running in simulator — skip
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    // Get the Expo push token
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) {
        console.warn("Missing EAS projectId for push token registration");
        return null;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      return tokenData.data;
    } catch (e) {
      console.warn("Failed to get push token:", e);
      return null;
    }
  }, []);

  // Subscribe token to backend for this org + player
  const subscribeToBackend = useCallback(async (token) => {
    if (!orgSlug || !playerName || !token) return;
    try {
      await api.subscribePush(orgSlug, playerName, token, playerToken);
    } catch (e) {
      console.warn("Failed to subscribe push:", e);
    }
  }, [orgSlug, playerName, playerToken]);

  // Initialize
  useEffect(() => {
    if (!orgSlug || !playerName || registered.current) return;

    (async () => {
      const token = await registerForPush();
      if (token) {
        setExpoPushToken(token);
        await subscribeToBackend(token);
        registered.current = true;
      }
    })();

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((notif) => {
      setNotification(notif);
    });

    // Listen for notification taps (background/killed → navigate)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.category === "challenge" && orgSlug) {
        // Navigate to battle tab
        router.push(`/game/${orgSlug}`);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [orgSlug, playerName, registerForPush, subscribeToBackend, router]);

  // Re-register when app comes back to foreground (token might have changed)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state === "active" && expoPushToken && orgSlug && playerName) {
        await subscribeToBackend(expoPushToken);
      }
    });
    return () => subscription?.remove();
  }, [expoPushToken, orgSlug, playerName, subscribeToBackend]);

  // Set badge count on iOS
  useEffect(() => {
    if (Platform.OS === "ios") {
      // Clear badge when app is active
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          Notifications.setBadgeCountAsync(0);
        }
      });
      return () => subscription?.remove();
    }
  }, []);

  return { expoPushToken, notification };
}
