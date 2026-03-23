// Active Campaigns — view and contribute to coin cut campaigns
// Shows: active campaigns with progress bars, contribution buttons, campaign creation
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "../lib/haptics";
import { useStripeSafe } from "../lib/stripe-safe";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { contributeToCampaign, formatPrice, isPaymentsEnabled } from "../lib/payments";
import t from "../lib/i18n";

const CONTRIBUTION_AMOUNTS = [100, 250, 500, 1000]; // cents

export default function CampaignsList() {
  const stripe = useStripeSafe();
  const { campaigns, player } = useGame();
  const { org, theme } = useOrg();
  const [contributing, setContributing] = useState(null);
  const paymentsEnabled = isPaymentsEnabled(org);

  const activeCampaigns = campaigns?.filter(c => c.status === "active") || [];

  const handleContribute = useCallback(async (campaign, amountCents) => {
    if (!paymentsEnabled) {
      Alert.alert(t("paymentsNotReady"), t("stripeNotConnectedYet"));
      return;
    }

    const isWipe = campaign.type === "wipe";
    const label = isWipe ? t("totalWipe") : t("percentCut", { pct: campaign.percentage });

    Alert.alert(
      t("contributeTo", { label }),
      t("campaignContributionPrompt", {
        amount: formatPrice(amountCents),
        label,
        name: campaign.targetName,
        current: formatPrice(campaign.contributedCents),
        total: formatPrice(campaign.totalPriceCents),
      }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("payAmount", { amount: formatPrice(amountCents) }),
          onPress: async () => {
            setContributing(campaign.id + "_" + amountCents);
            const result = await contributeToCampaign(stripe, org.slug, {
              campaignId: campaign.id,
              contributorName: player.name,
              cents: amountCents,
              playerToken: player.token,
            });
            setContributing(null);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ],
    );
  }, [stripe, org, player, paymentsEnabled]);

  if (activeCampaigns.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyEmoji}>{"\uD83D\uDCE2"}</Text>
        <Text style={styles.emptyText}>{t("noCampaigns")}</Text>
        <Text style={styles.emptyHint}>
          {t("startFromShop", { currency: theme.currencyName })}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={activeCampaigns}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item: campaign }) => {
        const progress = Math.min(100, (campaign.contributedCents / campaign.totalPriceCents) * 100);
        const isWipe = campaign.type === "wipe";
        const remaining = campaign.totalPriceCents - campaign.contributedCents;
        const contribCount = campaign.contributors?.length || 0;

        return (
          <View style={[styles.campaignCard, isWipe && { borderColor: "#ef4444" }]}>
            {/* Header */}
            <View style={styles.campaignHeader}>
              <Text style={styles.campaignEmoji}>{isWipe ? "\uD83D\uDCA5" : "\u2702\uFE0F"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.campaignTitle}>
                  {t("campaignTitle", {
                    label: isWipe ? t("totalWipe") : t("percentCut", { pct: campaign.percentage }),
                    name: campaign.targetName,
                  })}
                </Text>
                <Text style={styles.campaignCreator}>
                  {t("campaignByCreator", { name: campaign.creatorName, count: contribCount })}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View style={[
                  styles.progressFill,
                  { width: progress + "%", backgroundColor: isWipe ? "#ef4444" : theme.primary },
                ]} />
              </View>
              <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
            </View>
            <Text style={styles.progressLabel}>
              {formatPrice(campaign.contributedCents)} / {formatPrice(campaign.totalPriceCents)}
              {" - "}{formatPrice(remaining)} {t("toGo")}
            </Text>

            {/* Contribution buttons */}
            <View style={styles.contribRow}>
              {CONTRIBUTION_AMOUNTS.map((amount) => {
                if (amount > remaining) return null;
                const isLoading = contributing === campaign.id + "_" + amount;
                return (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.contribBtn, { borderColor: (isWipe ? "#ef4444" : theme.primary) + "55" }]}
                    onPress={() => handleContribute(campaign, amount)}
                    disabled={!!contributing}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Text style={[styles.contribBtnText, { color: isWipe ? "#ef4444" : theme.primary }]}>
                        {formatPrice(amount)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#666", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#444", marginTop: 4, textAlign: "center", paddingHorizontal: 40 },
  campaignCard: {
    backgroundColor: "#16213e", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#1e2a45",
  },
  campaignHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  campaignEmoji: { fontSize: 28 },
  campaignTitle: { fontSize: 15, fontWeight: "700", color: "#fff" },
  campaignCreator: { fontSize: 12, color: "#888", marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressBar: { flex: 1, height: 8, backgroundColor: "#222", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressPercent: { fontSize: 12, fontWeight: "700", color: "#aaa", width: 36, textAlign: "right" },
  progressLabel: { fontSize: 11, color: "#666", marginTop: 6 },
  contribRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  contribBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  contribBtnText: { fontSize: 13, fontWeight: "700" },
});
