// Skins — browse, preview, purchase, and equip custom coin skins
// Displays: pre-built skin packs from R2, owned skins, equipped indicator
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useStripe } from "@stripe/stripe-react-native";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { buySkin, formatPrice } from "../lib/payments";
import { api } from "../lib/api";
import t from "../lib/i18n";

// Pre-built skin catalog (loaded from R2 in production)
const DEFAULT_SKINS = [
  { id: "gold-rush", name: "Gold Rush", emoji: "\uD83E\uDE99", description: "Pure golden shine", priceCents: 599 },
  { id: "neon-glow", name: "Neon Glow", emoji: "\uD83D\uDFE2", description: "Electric neon energy", priceCents: 599 },
  { id: "fire-coin", name: "Fire Coin", emoji: "\uD83D\uDD25", description: "Blazing hot flames", priceCents: 599 },
  { id: "ice-crystal", name: "Ice Crystal", emoji: "\u2744\uFE0F", description: "Frozen perfection", priceCents: 599 },
  { id: "galaxy", name: "Galaxy", emoji: "\uD83C\uDF0C", description: "Cosmic swirl", priceCents: 799 },
  { id: "diamond", name: "Diamond", emoji: "\uD83D\uDC8E", description: "Brilliant clarity", priceCents: 999 },
  { id: "pixel-art", name: "Pixel Art", emoji: "\uD83D\uDFE5", description: "Retro pixel style", priceCents: 599 },
  { id: "nature", name: "Nature", emoji: "\uD83C\uDF3F", description: "Organic earth tones", priceCents: 599 },
];

export default function SkinsScreen() {
  const stripe = useStripe();
  const { player } = useGame();
  const { org, theme } = useOrg();
  const [skins] = useState(DEFAULT_SKINS);
  const [ownedSkins, setOwnedSkins] = useState([]);
  const [equippedSkin, setEquippedSkin] = useState(null);
  const [buying, setBuying] = useState(false);
  const [equipping, setEquipping] = useState(false);

  // Load owned skins from DO (via WS broadcast or API)
  useEffect(() => {
    // In production, skinData comes from the WebSocket broadcast
    // For now, we'll load it from the DO on mount
    if (org?.slug && player?.name) {
      api.request(`/orgs/${org.slug}/skins/data`, { retries: 1, authToken: player.token })
        .then(data => {
          const key = player.name.toLowerCase();
          setOwnedSkins(data?.owned?.[key] || []);
          setEquippedSkin(data?.equipped?.[key] || null);
        })
        .catch(() => {});
    }
  }, [org?.slug, player?.name]);

  const handleBuySkin = useCallback(async (skin) => {
    if (!org?.paymentsEnabled) {
      Alert.alert(t("paymentsNotReady"), t("connectStripePrompt"));
      return;
    }

    Alert.alert(
      skin.name,
      `${skin.description}\n\n${formatPrice(skin.priceCents)}\n\n${t("supportThisOrg", { org: org.name })}`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("buyAmount", { amount: formatPrice(skin.priceCents) }),
          onPress: async () => {
            setBuying(true);
            const result = await buySkin(stripe, org.slug, {
              playerName: player.name,
              skinId: skin.id,
              priceCents: skin.priceCents,
              playerToken: player.token,
            });
            setBuying(false);
            if (result.success) {
              if (!result.pendingSync) {
                setOwnedSkins(prev => [...prev, skin.id]);
              }
              Alert.alert(
                result.pendingSync ? t("paymentReceived") : t("purchaseComplete"),
                result.pendingSync
                  ? t("skinUnlockSync", { name: skin.name })
                  : t("skinUnlocked", { name: skin.name })
              );
            } else if (result.error) {
              Alert.alert(t("error"), result.error);
            }
          },
        },
      ],
    );
  }, [stripe, org, player]);

  const handleEquip = useCallback(async (skinId) => {
    setEquipping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.request(`/orgs/${org.slug}/skins/equip`, {
        method: "POST",
        body: { skinId, playerName: player.name },
        authToken: player.token,
      });
      setEquippedSkin(skinId === equippedSkin ? null : skinId);
    } catch (e) {
      Alert.alert(t("error"), e.message);
    }
    setEquipping(false);
  }, [org?.slug, player?.name, equippedSkin]);

  const renderSkin = useCallback(({ item: skin }) => {
    const owned = ownedSkins.includes(skin.id);
    const equipped = equippedSkin === skin.id;

    return (
      <TouchableOpacity
        style={[
          styles.skinCard,
          owned && { borderColor: theme.primary + "44" },
          equipped && { borderColor: theme.primary, backgroundColor: theme.primary + "0D" },
        ]}
        onPress={() => {
          Haptics.selectionAsync();
          if (owned) {
            handleEquip(skin.id);
          } else {
            handleBuySkin(skin);
          }
        }}
      >
        <Text style={styles.skinEmoji}>{skin.emoji}</Text>
        <Text style={styles.skinName}>{skin.name}</Text>
        <Text style={styles.skinDesc}>{skin.description}</Text>

        {equipped ? (
          <View style={[styles.equippedBadge, { backgroundColor: theme.primary }]}>
            <Text style={[styles.equippedText, { color: theme.secondary }]}>{t("equipped")}</Text>
          </View>
        ) : owned ? (
          <TouchableOpacity
            style={[styles.equipBtn, { borderColor: theme.primary }]}
            onPress={() => handleEquip(skin.id)}
          >
            <Text style={[styles.equipBtnText, { color: theme.primary }]}>{t("equip")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.priceBadge, { backgroundColor: theme.accent || "#e94560" }]}>
            <Text style={styles.priceText}>{formatPrice(skin.priceCents)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [ownedSkins, equippedSkin, theme, handleBuySkin, handleEquip]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t("skins")}</Text>
        <Text style={styles.ownedCount}>
          {t("ownedCount", { owned: ownedSkins.length, total: skins.length })}
        </Text>
      </View>

      {equippedSkin && (
        <View style={styles.currentSkin}>
          <Text style={styles.currentLabel}>{t("currentlyEquipped")}</Text>
          <Text style={[styles.currentName, { color: theme.primary }]}>
            {skins.find(s => s.id === equippedSkin)?.name || equippedSkin}
          </Text>
          <TouchableOpacity onPress={() => handleEquip("default")}>
            <Text style={styles.unequipLink}>{t("useDefault")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={skins}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderSkin}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {buying && (
        <View style={styles.buyingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.buyingText}>{t("processingPurchase")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  header: { fontSize: 24, fontWeight: "800", color: "#fff" },
  ownedCount: { fontSize: 13, color: "#888" },
  currentSkin: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#16213e", borderRadius: 10, padding: 10, marginBottom: 12,
  },
  currentLabel: { fontSize: 12, color: "#888" },
  currentName: { fontSize: 13, fontWeight: "700", flex: 1 },
  unequipLink: { fontSize: 12, color: "#ef4444", textDecorationLine: "underline" },
  grid: { paddingBottom: 20 },
  row: { gap: 10 },
  skinCard: {
    flex: 1, backgroundColor: "#16213e", borderRadius: 16,
    padding: 16, alignItems: "center", marginBottom: 10,
    borderWidth: 1.5, borderColor: "#1e2a45",
  },
  skinEmoji: { fontSize: 40, marginBottom: 8 },
  skinName: { fontSize: 14, fontWeight: "700", color: "#fff" },
  skinDesc: { fontSize: 11, color: "#888", marginTop: 2, textAlign: "center" },
  equippedBadge: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8,
  },
  equippedText: { fontSize: 12, fontWeight: "700" },
  equipBtn: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  equipBtnText: { fontSize: 12, fontWeight: "700" },
  priceBadge: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8,
  },
  priceText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  buyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center", alignItems: "center",
    borderRadius: 16,
  },
  buyingText: { color: "#fff", marginTop: 12, fontSize: 14 },
});
