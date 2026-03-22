// Ban Overlay — shown when a player is temporarily banned for autoclicking
// Displays reason, time remaining, and auto-dismisses when ban expires
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import t from "../lib/i18n";

export default function BanOverlay() {
  const { banInfo } = useGame();
  const { theme } = useOrg();
  const [timeLeft, setTimeLeft] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!banInfo?.until) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const update = () => {
      const remaining = Math.max(0, banInfo.until - Date.now());
      if (remaining <= 0) {
        setVisible(false);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [banInfo]);

  if (!visible) return null;

  return (
    <Modal transparent visible={true} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>{"\u26D4"}</Text>
          <Text style={styles.title}>{t("temporarilyBanned")}</Text>
          <Text style={styles.reason}>{banInfo?.reason || t("suspiciousActivityDetected")}</Text>

          <View style={[styles.timer, { borderColor: theme.accent || "#ef4444" }]}>
            <Text style={styles.timerLabel}>{t("banExpires")}</Text>
            <Text style={[styles.timerValue, { color: theme.accent || "#ef4444" }]}>
              {timeLeft}
            </Text>
          </View>

          <Text style={styles.info}>
            {t("banExplanation")}
          </Text>

          <Text style={styles.hint}>
            {t("canStillView")}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  card: {
    backgroundColor: "#16213e", borderRadius: 24, padding: 32,
    alignItems: "center", width: "100%", maxWidth: 360,
    borderWidth: 2, borderColor: "#ef4444",
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "900", color: "#ef4444" },
  reason: { fontSize: 14, color: "#aaa", marginTop: 8, textAlign: "center", lineHeight: 20 },
  timer: {
    marginTop: 24, paddingVertical: 16, paddingHorizontal: 32,
    borderWidth: 2, borderRadius: 16, alignItems: "center",
  },
  timerLabel: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1 },
  timerValue: { fontSize: 36, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  info: { fontSize: 13, color: "#666", marginTop: 20, textAlign: "center", lineHeight: 20 },
  hint: { fontSize: 12, color: "#555", marginTop: 12, textAlign: "center", fontStyle: "italic" },
});
