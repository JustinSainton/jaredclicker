// Admin Dashboard — mobile management for org administrators
// Features: live stats, player moderation (ban/unban, reset scores, add coins),
// autoban toggle, weekly reset schedule, fund management
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { api } from "../lib/api";
import { formatNumber } from "../lib/gameEngine";
import t from "../lib/i18n";

export default function AdminDashboard({ adminToken, onClose }) {
  const { leaderboard, online, visitors } = useGame();
  const { org, theme } = useOrg();

  const [dashboard, setDashboard] = useState(null);
  const [bannedPlayers, setBannedPlayers] = useState(null);
  const [autobanEnabled, setAutobanEnabled] = useState(true);
  const [resetSchedule, setResetSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTarget, setActionTarget] = useState("");
  const [addCoinsAmount, setAddCoinsAmount] = useState("");
  const [busy, setBusy] = useState(null);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      api.setToken(adminToken);
      const [dash, banned, autoban, schedule] = await Promise.all([
        api.getMe().catch(() => null),
        api.request(`/orgs/${org.slug}/admin/banned`).catch(() => ({})),
        api.request(`/orgs/${org.slug}/admin/autoban`).catch(() => ({ enabled: true })),
        api.request(`/orgs/${org.slug}/admin/reset-schedule`).catch(() => null),
      ]);
      setDashboard(dash);
      setBannedPlayers(banned);
      setAutobanEnabled(autoban?.enabled ?? true);
      setResetSchedule(schedule);
    } catch (e) {
      console.warn("Dashboard fetch error:", e);
    }
    setLoading(false);
  }, [adminToken, org?.slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Admin actions
  const resetAllScores = useCallback(() => {
    Alert.alert(t("resetAllScoresTitle"), t("resetAllScoresBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("resetAllAction"), style: "destructive",
        onPress: async () => {
          setBusy("resetAll");
          await api.request(`/orgs/${org.slug}/admin/reset-scores`, { method: "POST" });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setBusy(null);
          Alert.alert(t("done"), t("resetAllScoresDone"));
        },
      },
    ]);
  }, [org?.slug]);

  const resetPlayer = useCallback((playerName) => {
    Alert.alert(t("resetPlayerTitle", { name: playerName }), t("resetPlayerBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("resetAction"), style: "destructive",
        onPress: async () => {
          setBusy("reset_" + playerName);
          await api.request(`/orgs/${org.slug}/admin/reset-player`, { method: "POST", body: { playerName } });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setBusy(null);
        },
      },
    ]);
  }, [org?.slug]);

  const addCoins = useCallback(async (playerName) => {
    const amount = parseInt(addCoinsAmount, 10);
    if (!amount || amount <= 0) { Alert.alert(t("invalidAmount")); return; }
    setBusy("addcoins_" + playerName);
    await api.request(`/orgs/${org.slug}/admin/add-coins`, { method: "POST", body: { playerName, amount } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddCoinsAmount("");
    setBusy(null);
    Alert.alert(t("done"), t("addedCurrencyToPlayer", {
      amount: formatNumber(amount),
      currency: theme.currencyName,
      name: playerName,
    }));
  }, [org?.slug, addCoinsAmount, theme.currencyName]);

  const unbanPlayer = useCallback(async (playerName) => {
    setBusy("unban_" + playerName);
    await api.request(`/orgs/${org.slug}/admin/unban`, { method: "POST", body: { playerName } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBusy(null);
    await fetchData();
  }, [org?.slug, fetchData]);

  const toggleAutoban = useCallback(async () => {
    const newState = !autobanEnabled;
    await api.request(`/orgs/${org.slug}/admin/autoban`, { method: "POST", body: { enabled: newState } });
    setAutobanEnabled(newState);
    Haptics.selectionAsync();
  }, [org?.slug, autobanEnabled]);

  const toggleWeeklyReset = useCallback(async () => {
    const newState = !(resetSchedule?.enabled);
    await api.request(`/orgs/${org.slug}/admin/reset-schedule`, { method: "POST", body: { enabled: newState } });
    setResetSchedule(prev => ({ ...prev, enabled: newState }));
    Haptics.selectionAsync();
  }, [org?.slug, resetSchedule]);

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 60 }} /></View>;
  }

  const bannedList = bannedPlayers ? Object.entries(bannedPlayers) : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>{"\u2699\uFE0F"} {t("admin")}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>{"\u2715"}</Text>
        </TouchableOpacity>
      </View>

      {/* Live stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderColor: theme.primary + "33" }]}>
          <Text style={[styles.statValue, { color: theme.primary }]}>{visitors || online?.length || 0}</Text>
          <Text style={styles.statLabel}>{t("online")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{leaderboard.length}</Text>
          <Text style={styles.statLabel}>{t("players")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{bannedList.length}</Text>
          <Text style={styles.statLabel}>{t("banned")}</Text>
        </View>
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>{t("actions")}</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444" + "22", borderColor: "#ef4444" + "44" }]} onPress={resetAllScores}>
          <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>{"\uD83D\uDD04"} {t("resetAllScores")}</Text>
        </TouchableOpacity>
      </View>

      {/* Toggles */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>{t("autoclickerDetection")}</Text>
          <Text style={styles.toggleDesc}>{t("autoclickerDetectionDesc")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.toggle, autobanEnabled && { backgroundColor: "#4ade80" }]}
          onPress={toggleAutoban}
        >
          <View style={[styles.toggleKnob, autobanEnabled && { alignSelf: "flex-end" }]} />
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>{t("weeklyScoreReset")}</Text>
          <Text style={styles.toggleDesc}>{t("weeklyScoreResetDesc")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.toggle, resetSchedule?.enabled && { backgroundColor: "#4ade80" }]}
          onPress={toggleWeeklyReset}
        >
          <View style={[styles.toggleKnob, resetSchedule?.enabled && { alignSelf: "flex-end" }]} />
        </TouchableOpacity>
      </View>

      {/* Player management */}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t("playerManagement")}</Text>
      <TextInput
        style={styles.searchInput}
        value={actionTarget}
        onChangeText={setActionTarget}
        placeholder={t("playerNamePlaceholder")}
        placeholderTextColor="#555"
      />
      {actionTarget.trim().length > 0 && (
        <View style={styles.playerActions}>
          <TouchableOpacity
            style={[styles.playerActionBtn, { borderColor: "#ef4444" + "44" }]}
            onPress={() => resetPlayer(actionTarget.trim())}
            disabled={busy?.startsWith("reset_")}
          >
            <Text style={[styles.playerActionText, { color: "#ef4444" }]}>{t("resetScore")}</Text>
          </TouchableOpacity>
          <View style={styles.addCoinsRow}>
            <TextInput
              style={styles.addCoinsInput}
              value={addCoinsAmount}
              onChangeText={setAddCoinsAmount}
              placeholder={t("amountPlaceholder")}
              placeholderTextColor="#555"
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[styles.playerActionBtn, { borderColor: "#4ade80" + "44", flex: 1 }]}
              onPress={() => addCoins(actionTarget.trim())}
              disabled={busy?.startsWith("addcoins_")}
            >
              <Text style={[styles.playerActionText, { color: "#4ade80" }]}>
                {t("addCurrency", { currency: theme.currencyName })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Banned players */}
      {bannedList.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            {t("bannedPlayersTitle", { count: bannedList.length })}
          </Text>
          {bannedList.map(([name, info]) => (
            <View key={name} style={styles.bannedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannedName}>{name}</Text>
                <Text style={styles.bannedReason}>{info.reason}</Text>
                <Text style={styles.bannedUntil}>
                  {t("expiresAt", { time: new Date(info.until).toLocaleTimeString() })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.unbanBtn}
                onPress={() => unbanPlayer(name)}
                disabled={busy === "unban_" + name}
              >
                {busy === "unban_" + name ? (
                  <ActivityIndicator size="small" color="#4ade80" />
                ) : (
                  <Text style={styles.unbanText}>{t("unban")}</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  header: { fontSize: 24, fontWeight: "800", color: "#fff" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center" },
  closeBtnText: { fontSize: 16, color: "#aaa" },

  // Stats
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: "#16213e", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#1e2a45" },
  statValue: { fontSize: 24, fontWeight: "900", color: "#fff" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 4, textTransform: "uppercase" },

  // Sections
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#ccc", marginBottom: 10 },

  // Actions
  actionsRow: { gap: 8, marginBottom: 16 },
  actionBtn: { borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontWeight: "700" },

  // Toggles
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#16213e", borderRadius: 12, padding: 14, marginBottom: 8 },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  toggleDesc: { fontSize: 11, color: "#888", marginTop: 2 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: "#333", padding: 3, justifyContent: "center" },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },

  // Player management
  searchInput: {
    backgroundColor: "#16213e", borderRadius: 10, padding: 12,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#1e2a45", marginBottom: 10,
  },
  playerActions: { gap: 8, marginBottom: 16 },
  playerActionBtn: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: "center" },
  playerActionText: { fontSize: 14, fontWeight: "600" },
  addCoinsRow: { flexDirection: "row", gap: 8 },
  addCoinsInput: {
    backgroundColor: "#16213e", borderRadius: 10, padding: 12,
    color: "#fff", fontSize: 15, width: 100, textAlign: "center",
    borderWidth: 1, borderColor: "#1e2a45",
  },

  // Banned
  bannedRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#16213e", borderRadius: 12, padding: 12, marginBottom: 6 },
  bannedName: { fontSize: 14, fontWeight: "600", color: "#fff" },
  bannedReason: { fontSize: 11, color: "#ef4444", marginTop: 2 },
  bannedUntil: { fontSize: 11, color: "#888", marginTop: 2 },
  unbanBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#4ade80" + "22" },
  unbanText: { fontSize: 13, fontWeight: "700", color: "#4ade80" },
});
