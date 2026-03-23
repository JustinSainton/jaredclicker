// Deep link handler: fundclicker://join/JARED1 or https://api.fundclicker.com/join/JARED1
// Auto-joins the org by code and navigates to the game screen
import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useOrg } from "../../context/OrgContext";

export default function JoinByCode() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const { joinByCode } = useOrg();

  useEffect(() => {
    if (!code) return;
    (async () => {
      try {
        const org = await joinByCode(code.toUpperCase());
        if (org?.slug) {
          router.replace(`/game/${org.slug}`);
        } else {
          router.replace("/");
        }
      } catch (e) {
        console.error("Join by code failed:", e);
        router.replace("/");
      }
    })();
  }, [code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#d4a826" />
      <Text style={styles.text}>Joining fundraiser...</Text>
      <Text style={styles.code}>{code?.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#07070b" },
  text: { color: "#a0a0b8", fontSize: 16, marginTop: 16 },
  code: { color: "#d4a826", fontSize: 32, fontWeight: "800", letterSpacing: 6, marginTop: 8 },
});
