// Shop — production-grade purchase experience
// Full upgrade tree (28 upgrades), sabotage credits with Stripe payment,
// coin cuts with target picker, break-free from sabotage,
// credits display, purchase confirmations, loading states
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useStripeSafe } from "../lib/stripe-safe";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { useGameState } from "../hooks/useGameState";
import {
  DEFAULT_UPGRADES,
  getUpgradeCost,
  purchaseUpgrade,
  formatNumber,
  saveGameState,
} from "../lib/gameEngine";
import {
  SABOTAGE_PACKS,
  COIN_CUT_PRICES,
  buySabotageCredits,
  buyCoinCut,
  buyBreakFree,
  formatPrice,
  isPaymentsEnabled,
} from "../lib/payments";
import { playUpgrade } from "../lib/sounds";
import t from "../lib/i18n";

// ─── TARGET PICKER MODAL ──────────────────────────────────────────────────────

function TargetPickerModal({ visible, onClose, onSelect, leaderboard, playerName, theme, title }) {
  const targets = useMemo(() =>
    leaderboard.filter(e => e.name.toLowerCase() !== playerName?.toLowerCase() && e.score > 0),
    [leaderboard, playerName]
  );

  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title || t("chooseTarget")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>{"\u2715"}</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={targets}
            keyExtractor={(item) => item.name.toLowerCase()}
            style={styles.targetList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.targetRow}
                onPress={() => { Haptics.selectionAsync(); onSelect(item); }}
              >
                <Text style={styles.targetName}>{item.name}</Text>
                <Text style={[styles.targetScore, { color: theme.primary }]}>
                  {formatNumber(item.score)}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.targetEmpty}>{t("noEligibleTargets")}</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── MAIN SHOP SCREEN ─────────────────────────────────────────────────────────

export default function ShopScreen() {
  const stripe = useStripeSafe();
  const { player, leaderboard, credits, sabotages } = useGame();
  const { org, theme } = useOrg();
  const { gameState, setGameState } = useGameState();

  const [buying, setBuying] = useState(null); // which item is being purchased
  const [targetPicker, setTargetPicker] = useState(null); // { type, percentage }
  const paymentsEnabled = isPaymentsEnabled(org);

  // Player's sabotage credit count
  const myCredits = credits?.[player?.name?.toLowerCase()] || 0;

  // Is player currently sabotaged?
  const isSabotaged = sabotages?.some(
    s => s.targetName.toLowerCase() === player?.name?.toLowerCase() && s.expiresAt > Date.now()
  );

  // ─── UPGRADE PURCHASE ──────────────────────────────────────────────
  const handleBuyUpgrade = useCallback((upgradeId) => {
    if (!gameState) return;
    const newState = purchaseUpgrade(gameState, upgradeId);
    if (!newState) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playUpgrade();
    setGameState(newState);
    if (org?.slug) saveGameState(org.slug, newState);
  }, [gameState, setGameState, org?.slug]);

  // ─── SABOTAGE CREDIT PURCHASE ──────────────────────────────────────
  const handleBuySabotage = useCallback(async (pack) => {
    if (!paymentsEnabled) {
      Alert.alert(t("paymentsNotReady"), t("connectStripePrompt"));
      return;
    }
    setBuying(pack.id);
    const result = await buySabotageCredits(stripe, org.slug, player.name, pack, player.token);
    setBuying(null);
    if (result.success) {
      if (result.pendingSync) {
        Alert.alert(t("paymentReceived"), t("purchaseSyncCredits"));
      } else {
        Alert.alert(t("purchaseComplete"), t("sabotageCreditsOwned", { count: myCredits + pack.credits }));
      }
    } else if (result.error) {
      Alert.alert(t("purchaseFailed"), result.error);
    }
  }, [stripe, org?.slug, player?.name, paymentsEnabled, myCredits]);

  // ─── COIN CUT PURCHASE ─────────────────────────────────────────────
  const handleCoinCut = useCallback((percentage) => {
    if (!paymentsEnabled) {
      Alert.alert(t("paymentsNotReady"), t("connectStripePrompt"));
      return;
    }
    setTargetPicker({ type: "coincut", percentage });
  }, [paymentsEnabled]);

  const executeCoinCut = useCallback(async (target) => {
    setTargetPicker(null);
    const pct = targetPicker?.percentage;
    if (!pct || !target) return;

    const priceCents = COIN_CUT_PRICES[pct];
    Alert.alert(
      t("coinCutPromptTitle", { name: target.name, currency: theme.currencyName }),
      t("coinCutPromptBody", {
        pct,
        amount: formatNumber(target.score),
        currency: theme.currencyName,
        price: formatPrice(priceCents),
        org: org?.name || t("appName"),
      }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("payAmount", { amount: formatPrice(priceCents) }),
              onPress: async () => {
                setBuying("coincut_" + pct);
                const result = await buyCoinCut(stripe, org.slug, {
                  attackerName: player.name,
                  targetName: target.name,
                  percentage: pct,
                  playerToken: player.token,
                });
                setBuying(null);
                if (result.success) {
                  if (result.pendingSync) {
                    Alert.alert(t("paymentReceived"), t("purchaseSyncCoinCut"));
                  } else {
                    const removed = Math.floor(target.score * (pct / 100));
                    Alert.alert(
                      t("coinCutExecutedTitle"),
                      t("coinCutExecuted", { name: target.name, amount: formatNumber(removed), currency: theme.currencyName })
                    );
                  }
                } else if (result.error) {
                  Alert.alert(t("purchaseFailed"), result.error);
                }
          },
        },
      ],
    );
  }, [targetPicker, stripe, org, player, theme]);

  // ─── BREAK FREE ────────────────────────────────────────────────────
  const handleBreakFree = useCallback(async () => {
    if (!paymentsEnabled) return;
    Alert.alert(
      t("breakFreePromptTitle"),
      t("breakFreePromptBody", { amount: formatPrice(99), org: org?.name || t("appName") }),
      [
        { text: t("waitItOut"), style: "cancel" },
        {
          text: t("payAmount", { amount: formatPrice(99) }),
          onPress: async () => {
            setBuying("breakfree");
            const result = await buyBreakFree(stripe, org.slug, player.name, player.token);
            setBuying(null);
            if (result.success) {
              Alert.alert(
                result.pendingSync ? t("paymentReceived") : t("freedom"),
                result.pendingSync
                  ? t("breakFreeSync")
                  : t("breakFreeDone")
              );
            } else if (result.error) {
              Alert.alert(t("purchaseFailed"), result.error);
            }
          },
        },
      ],
    );
  }, [stripe, org, player, paymentsEnabled]);

  if (!gameState) {
    return <View style={styles.container}><ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} /></View>;
  }

  // Visible upgrades: purchased + affordable + next 3 unaffordable
  const visibleUpgrades = useMemo(() => {
    let lastPurchasedIdx = -1;
    DEFAULT_UPGRADES.forEach((u, i) => {
      if ((gameState.upgrades[u.id] || 0) > 0) lastPurchasedIdx = i;
    });

    return DEFAULT_UPGRADES.filter((upgrade, index) => {
      const owned = gameState.upgrades[upgrade.id] || 0;
      const cost = getUpgradeCost(upgrade, owned);
      if (owned > 0) return true;
      if (gameState.coins >= cost * 0.3) return true;
      return index <= lastPurchasedIdx + 4;
    });
  }, [gameState.upgrades, gameState.coins]);

  const COIN_CUT_PCTS = [5, 10, 25, 40];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.header}>{t("shop")}</Text>
      <View style={styles.balanceRow}>
        <View>
          <Text style={styles.balanceLabel}>{t("balance")}</Text>
          <Text style={[styles.balanceValue, { color: theme.primary }]}>{formatNumber(gameState.coins)}</Text>
        </View>
        {myCredits > 0 && (
          <View style={[styles.creditsBadge, { borderColor: theme.accent || "#e94560" }]}>
            <Text style={styles.creditsEmoji}>{"\uD83D\uDCA3"}</Text>
            <Text style={[styles.creditsCount, { color: theme.accent || "#e94560" }]}>{myCredits}</Text>
            <Text style={styles.creditsLabel}>{t("credits")}</Text>
          </View>
        )}
      </View>

      {/* ─── BREAK FREE (shown when sabotaged) ─────────────────────── */}
      {isSabotaged && paymentsEnabled && (
        <TouchableOpacity
          style={[styles.breakFreeCard, { borderColor: "#4ade80" }]}
          onPress={handleBreakFree}
          disabled={buying === "breakfree"}
        >
          {buying === "breakfree" ? (
            <ActivityIndicator color="#4ade80" />
          ) : (
            <>
              <Text style={styles.breakFreeEmoji}>{"\uD83D\uDD13"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.breakFreeTitle}>{t("breakFree")}</Text>
                <Text style={styles.breakFreeDesc}>{t("removeSabotage")}</Text>
              </View>
              <View style={[styles.priceTag, { backgroundColor: "#4ade80" }]}>
                <Text style={[styles.priceText, { color: "#1a1a2e" }]}>{formatPrice(99)}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ─── UPGRADES ──────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>{"\u2B06\uFE0F"} {t("upgradesSection")}</Text>
      <Text style={styles.sectionDesc}>
        {t("boostYour", { currency: theme.currencyName })}
      </Text>
      {visibleUpgrades.map((upgrade) => {
        const owned = gameState.upgrades[upgrade.id] || 0;
        const cost = getUpgradeCost(upgrade, owned);
        const canAfford = gameState.coins >= cost;
        const isAuto = upgrade.autoBonus > 0;

        return (
          <TouchableOpacity
            key={upgrade.id}
            style={[styles.upgradeItem, canAfford && { borderColor: theme.primary + "55" }]}
            onPress={() => handleBuyUpgrade(upgrade.id)}
            disabled={!canAfford}
            activeOpacity={canAfford ? 0.7 : 1}
          >
            <View style={styles.upgradeLeft}>
              <Text style={styles.upgradeEmoji}>{upgrade.emoji}</Text>
              <View style={styles.upgradeInfo}>
                <Text style={[styles.upgradeName, !canAfford && { color: "#555" }]}>
                  {upgrade.name}
                  {owned > 0 && <Text style={styles.ownedBadge}> x{owned}</Text>}
                </Text>
                <Text style={styles.upgradeDesc}>{upgrade.desc}</Text>
                <Text style={[styles.upgradeType, { color: isAuto ? "#4ade80" : "#60a5fa" }]}>
                  {isAuto ? t("autoUpgrade") : t("clickUpgrade")}
                </Text>
              </View>
            </View>
            <View style={[styles.costTag, canAfford && { backgroundColor: theme.primary }]}>
              <Text style={[styles.costText, canAfford && { color: "#1a1a2e" }]}>
                {formatNumber(cost)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
      {DEFAULT_UPGRADES.length > visibleUpgrades.length && (
        <Text style={styles.moreUpgrades}>
          {t("moreToUnlock", { count: DEFAULT_UPGRADES.length - visibleUpgrades.length })}
        </Text>
      )}

      {/* ─── SABOTAGE CREDITS ──────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{"\uD83D\uDCA3"} {t("sabotageCredits")}</Text>
      <Text style={styles.sectionDesc}>
        {t("sabotageDesc")}
      </Text>
      {SABOTAGE_PACKS.map((pack) => (
        <TouchableOpacity
          key={pack.id}
          style={styles.shopItem}
          onPress={() => handleBuySabotage(pack)}
          disabled={buying === pack.id}
        >
          {buying === pack.id ? (
            <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{pack.emoji} {pack.label}</Text>
                <Text style={styles.itemDesc}>{t("halvSpeed")}</Text>
              </View>
              <View style={[styles.priceTag, { backgroundColor: theme.accent || "#e94560" }]}>
                <Text style={styles.priceText}>{formatPrice(pack.priceCents)}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      ))}
      {!paymentsEnabled && (
        <Text style={styles.paymentsNote}>
          {"\u26A0\uFE0F"} {t("connectStripePrompt")}
        </Text>
      )}

      {/* ─── COIN CUTS ─────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{"\u2702\uFE0F"} {t("coinCuts", { currency: theme.currencyName })}</Text>
      <Text style={styles.sectionDesc}>
        Cut a percentage of another player's {theme.currencyName}!
      </Text>
      {COIN_CUT_PCTS.map((pct) => (
        <TouchableOpacity
          key={pct}
          style={styles.shopItem}
          onPress={() => handleCoinCut(pct)}
          disabled={!!buying?.startsWith?.("coincut")}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{"\u2702\uFE0F"} {pct}% {theme.currencyName} Cut</Text>
            <Text style={styles.itemDesc}>Remove {pct}% of target's {theme.currencyName}</Text>
          </View>
          <View style={[styles.priceTag, { backgroundColor: "#ef4444" }]}>
            <Text style={styles.priceText}>{formatPrice(COIN_CUT_PRICES[pct])}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* ─── REVENUE NOTICE ────────────────────────────────────────── */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {"\uD83D\uDCB0"} {t("allPurchasesSupport", { org: org?.name || t("appName") })}
          {"\n"}{t("orgReceives")}
        </Text>
      </View>

      <View style={{ height: 40 }} />

      {/* Target picker modal */}
      <TargetPickerModal
        visible={!!targetPicker}
        onClose={() => setTargetPicker(null)}
        onSelect={executeCoinCut}
        leaderboard={leaderboard}
        playerName={player?.name}
        theme={theme}
        title={targetPicker ? t("chooseTargetForCut", { pct: targetPicker.percentage }) : ""}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 8 },
  // Balance row
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  balanceLabel: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1 },
  balanceValue: { fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  creditsBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
  },
  creditsEmoji: { fontSize: 16 },
  creditsCount: { fontSize: 18, fontWeight: "800" },
  creditsLabel: { fontSize: 11, color: "#888" },
  // Break free card
  breakFreeCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(74,222,128,0.08)", borderWidth: 1.5,
    borderRadius: 16, padding: 16, marginBottom: 20,
  },
  breakFreeEmoji: { fontSize: 28 },
  breakFreeTitle: { fontSize: 16, fontWeight: "700", color: "#4ade80" },
  breakFreeDesc: { fontSize: 12, color: "#888", marginTop: 2 },
  // Sections
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: "#888", marginBottom: 12 },
  // Upgrades
  upgradeItem: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16213e", borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: "#1e2a45",
  },
  upgradeLeft: { flexDirection: "row", flex: 1, alignItems: "center", gap: 10 },
  upgradeEmoji: { fontSize: 26, width: 34, textAlign: "center" },
  upgradeInfo: { flex: 1 },
  upgradeName: { fontSize: 14, color: "#fff", fontWeight: "700" },
  ownedBadge: { color: "#4ade80", fontSize: 12 },
  upgradeDesc: { fontSize: 11, color: "#888", marginTop: 2 },
  upgradeType: { fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 3 },
  costTag: { backgroundColor: "#222", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 60, alignItems: "center" },
  costText: { fontSize: 13, fontWeight: "800", color: "#666" },
  moreUpgrades: { color: "#555", textAlign: "center", marginTop: 8, marginBottom: 8, fontSize: 13, fontStyle: "italic" },
  // Shop items (real-money purchases)
  shopItem: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#16213e", borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#1e2a45", minHeight: 60,
  },
  itemName: { fontSize: 15, color: "#fff", fontWeight: "600" },
  itemDesc: { fontSize: 12, color: "#888", marginTop: 3, lineHeight: 17 },
  priceTag: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 12 },
  priceText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  paymentsNote: { fontSize: 12, color: "#f59e0b", textAlign: "center", marginTop: 8, fontStyle: "italic" },
  // Notice
  notice: {
    marginTop: 28, padding: 16, backgroundColor: "#16213e",
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,215,0,0.15)",
  },
  noticeText: { color: "#FFD700", fontSize: 13, textAlign: "center", lineHeight: 20 },
  // Target picker modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#16213e", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "70%", paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 20, borderBottomWidth: 1, borderBottomColor: "#222",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  modalClose: { fontSize: 18, color: "#888", padding: 4 },
  targetList: { paddingHorizontal: 16 },
  targetRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1a1a2e",
  },
  targetName: { fontSize: 16, color: "#fff", fontWeight: "600" },
  targetScore: { fontSize: 14, fontWeight: "700" },
  targetEmpty: { color: "#666", textAlign: "center", padding: 40, fontSize: 14 },
});
