// Org selection / join screen — entry point of the app
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useOrg } from "../context/OrgContext";
import t from "../lib/i18n";

export default function OrgSelectScreen() {
  const router = useRouter();
  const { org, joinByCode, selectOrg, loading } = useOrg();
  const [joinCode, setJoinCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If already joined an org, go directly to game
  React.useEffect(() => {
    if (!loading && org) {
      router.replace(`/game/${org.slug}`);
    }
  }, [loading, org]);

  const handleJoinCode = useCallback(async () => {
    if (joinCode.length !== 6) {
      setError("Join code must be 6 characters");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const info = await joinByCode(joinCode);
      router.replace(`/game/${info.slug}`);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }, [joinCode, joinByCode, router]);

  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const { api } = require("../lib/api");
      const result = await api.searchOrgs(query);
      setSearchResults(result.orgs || []);
    } catch {}
  }, []);

  const handleSelectOrg = useCallback(async (slug) => {
    setBusy(true);
    try {
      const info = await selectOrg(slug);
      router.replace(`/game/${info.slug}`);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }, [selectOrg, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("appName")}</Text>
        <Text style={styles.subtitle}>{t("findFundraiser")}</Text>
      </View>

      <View style={styles.joinSection}>
        <Text style={styles.label}>{t("enterJoinCode")}</Text>
        <View style={styles.codeRow}>
          <TextInput
            style={styles.codeInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase().slice(0, 6))}
            placeholder={t("joinCodePlaceholder")}
            placeholderTextColor="#666"
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.joinButton, busy && styles.disabled]}
            onPress={handleJoinCode}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#1a1a2e" />
            ) : (
              <Text style={styles.joinButtonText}>{t("join")}</Text>
            )}
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("orSearch")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={handleSearch}
        placeholder={t("searchFundraisers")}
        placeholderTextColor="#666"
      />

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.slug}
        style={styles.results}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.resultItem}
            onPress={() => handleSelectOrg(item.slug)}
          >
            <Text style={styles.resultName}>{item.name}</Text>
            <Text style={styles.resultDesc} numberOfLines={1}>
              {item.description || item.slug}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          searchQuery.length >= 2 ? (
            <Text style={styles.emptyText}>{t("noFundraisersFound")}</Text>
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", paddingHorizontal: 24, paddingTop: 80 },
  header: { alignItems: "center", marginBottom: 40 },
  title: { fontSize: 36, fontWeight: "800", color: "#FFD700", letterSpacing: 1 },
  subtitle: { fontSize: 16, color: "#aaa", marginTop: 8 },
  joinSection: { marginBottom: 24 },
  label: { fontSize: 14, color: "#ccc", marginBottom: 8, fontWeight: "600" },
  codeRow: { flexDirection: "row", gap: 12 },
  codeInput: {
    flex: 1, backgroundColor: "#16213e", borderRadius: 12, padding: 16,
    fontSize: 24, color: "#fff", textAlign: "center", letterSpacing: 4,
    fontWeight: "700", borderWidth: 1, borderColor: "#333",
  },
  joinButton: {
    backgroundColor: "#FFD700", borderRadius: 12, paddingHorizontal: 24,
    justifyContent: "center", alignItems: "center",
  },
  joinButtonText: { fontSize: 18, fontWeight: "700", color: "#1a1a2e" },
  disabled: { opacity: 0.5 },
  error: { color: "#e94560", marginTop: 8, fontSize: 14 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#333" },
  dividerText: { color: "#aaa", marginHorizontal: 16, fontSize: 14 },
  searchInput: {
    backgroundColor: "#16213e", borderRadius: 12, padding: 16,
    fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "#333",
  },
  results: { marginTop: 16 },
  resultItem: {
    backgroundColor: "#16213e", borderRadius: 12, padding: 16,
    marginBottom: 8, borderWidth: 1, borderColor: "#333",
  },
  resultName: { fontSize: 18, fontWeight: "700", color: "#fff" },
  resultDesc: { fontSize: 14, color: "#aaa", marginTop: 4 },
  emptyText: { color: "#aaa", textAlign: "center", marginTop: 24 },
});
