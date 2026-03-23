// Chat — production-grade real-time messaging
// Features: message grouping, timestamps, scroll-to-bottom FAB, unread count,
// system message styling by type, haptic feedback, proper key management,
// auto-scroll only when at bottom, online count header
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Keyboard,
} from "react-native";
import * as Haptics from "../lib/haptics";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import t from "../lib/i18n";
import { headingStyle, bodyStyle } from "../lib/theme-styles";

// Unique ID generator for messages without server IDs
let _msgId = 0;
function nextMsgId() { return "msg_" + Date.now() + "_" + (++_msgId); }

// Format timestamp as "2:34 PM" or "Yesterday 2:34 PM" etc.
function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) return time;
  if (diffDays === 1) return t("yesterday") + " " + time;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

// Should we show a timestamp separator between two messages?
function shouldShowTimestamp(prev, curr) {
  if (!prev || !curr) return true;
  if (!prev.timestamp || !curr.timestamp) return false;
  // Show timestamp if gap > 5 minutes
  return curr.timestamp - prev.timestamp > 5 * 60 * 1000;
}

// Are two messages from the same sender within 60s? (for grouping)
function isSameSenderGroup(prev, curr) {
  if (!prev || !curr) return false;
  if (prev.type === "system" || curr.type === "system") return false;
  if (!prev.name || !curr.name) return false;
  if (prev.name.toLowerCase() !== curr.name.toLowerCase()) return false;
  if (!prev.timestamp || !curr.timestamp) return true;
  return curr.timestamp - prev.timestamp < 60000;
}

// Classify system messages for different styling
function getSystemMessageStyle(message) {
  if (!message) return "default";
  const m = message.toLowerCase();
  if (m.includes("sabotage") || m.includes("slowed down")) return "sabotage";
  if (m.includes("campaign") || m.includes("coin cut") || m.includes("wipe")) return "campaign";
  if (m.includes("battle") || m.includes("won") || m.includes("vs") || m.includes("\u2694")) return "battle";
  if (m.includes("reset") || m.includes("admin")) return "admin";
  if (m.includes("unbanned")) return "positive";
  if (m.includes("banned")) return "negative";
  return "default";
}

const SYSTEM_COLORS = {
  default: "#888",
  sabotage: "#ef4444",
  campaign: "#f59e0b",
  battle: "#8b5cf6",
  admin: "#06b6d4",
  positive: "#4ade80",
  negative: "#ef4444",
};

export default function ChatScreen() {
  const { chatMessages, sendChat, player, online } = useGame();
  const { theme } = useOrg();
  const [message, setMessage] = useState("");
  const listRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollBtnAnim = useRef(new Animated.Value(0)).current;
  const prevMessageCountRef = useRef(0);
  const inputRef = useRef(null);

  // Assign stable keys to messages
  const messagesWithKeys = useMemo(() => {
    return chatMessages.map((msg, i) => ({
      ...msg,
      _key: msg.id || msg._key || "chat_" + (msg.timestamp || 0) + "_" + i,
      _prevMsg: i > 0 ? chatMessages[i - 1] : null,
    }));
  }, [chatMessages]);

  // Track if user is at bottom of list
  const handleScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const atBottom = distanceFromBottom < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, []);

  // Auto-scroll when new messages arrive, but only if user is at bottom
  useEffect(() => {
    const newCount = chatMessages.length;
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;

    if (newCount > prevCount) {
      if (isAtBottom) {
        // Small delay to let FlatList render the new item
        setTimeout(() => {
          listRef.current?.scrollToEnd?.({ animated: true });
        }, 50);
      } else {
        // User is scrolled up — increment unread
        setUnreadCount((c) => c + (newCount - prevCount));
      }
    }
  }, [chatMessages.length, isAtBottom]);

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    Animated.spring(scrollBtnAnim, {
      toValue: (!isAtBottom && chatMessages.length > 5) ? 1 : 0,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [isAtBottom, chatMessages.length]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd?.({ animated: true });
    setUnreadCount(0);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendChat(trimmed);
    setMessage("");
    // Scroll to bottom after sending
    setTimeout(() => {
      listRef.current?.scrollToEnd?.({ animated: true });
    }, 100);
  }, [message, sendChat]);

  const renderMessage = useCallback(({ item, index }) => {
    const isSystem = item.type === "system";
    const isMe = item.name?.toLowerCase() === player?.name?.toLowerCase();
    const grouped = isSameSenderGroup(item._prevMsg, item);
    const showTime = shouldShowTimestamp(item._prevMsg, item);

    // Timestamp separator
    const timestampSeparator = showTime ? (
      <View style={styles.timestampRow}>
        <View style={styles.timestampLine} />
        <Text style={styles.timestampText}>{formatTimestamp(item.timestamp)}</Text>
        <View style={styles.timestampLine} />
      </View>
    ) : null;

    if (isSystem) {
      const systemType = getSystemMessageStyle(item.message);
      const color = SYSTEM_COLORS[systemType];
      return (
        <View>
          {timestampSeparator}
          <View style={[styles.systemMsg, { borderLeftColor: color }]}>
            <Text style={[styles.systemText, { color }]}>{item.message}</Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        {timestampSeparator}
        <View style={[
          styles.chatMsg,
          isMe && styles.chatMsgMe,
          grouped && styles.chatMsgGrouped,
        ]}>
          {/* Show name only if not grouped */}
          {!grouped && (
            <View style={styles.chatHeader}>
              <Text style={[styles.chatName, isMe && { color: theme.primary }]}>
                {item.name}
              </Text>
              {!showTime && item.timestamp && (
                <Text style={styles.chatTime}>
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              )}
            </View>
          )}
          <Text style={[styles.chatText, isMe && styles.chatTextMe]}>{item.message}</Text>
        </View>
      </View>
    );
  }, [player?.name, theme.primary]);

  const keyExtractor = useCallback((item) => item._key, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Header with online count */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t("chat")}</Text>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>{online?.length || 0} {t("online")}</Text>
        </View>
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messagesWithKeys}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={false}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={20}
        windowSize={15}
        initialNumToRender={30}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>{"\uD83D\uDCAC"}</Text>
            <Text style={styles.emptyText}>{t("noMessages")}</Text>
            <Text style={styles.emptyHint}>{t("beFirst")}</Text>
          </View>
        }
      />

      {/* Scroll to bottom FAB */}
      <Animated.View
        style={[
          styles.scrollFab,
          {
            opacity: scrollBtnAnim,
            transform: [{
              translateY: scrollBtnAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [60, 0],
              }),
            }],
          },
        ]}
        pointerEvents={isAtBottom ? "none" : "auto"}
      >
        <TouchableOpacity style={styles.scrollFabBtn} onPress={scrollToBottom}>
          <Text style={styles.scrollFabArrow}>{"\u2193"}</Text>
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.unreadText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder={t("typeMessage")}
          placeholderTextColor="#555"
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          autoCorrect={true}
          enablesReturnKeyAutomatically={true}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: message.trim() ? theme.primary : "#333" },
          ]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Text style={[styles.sendText, { color: message.trim() ? "#1a1a2e" : "#666" }]}>
            {"\u2191"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  header: { fontSize: 24, fontWeight: "800", color: "#fff" },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16213e", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  onlineText: { fontSize: 12, color: "#4ade80", fontWeight: "600" },

  // List
  list: { flex: 1 },
  listContent: { paddingBottom: 8, paddingTop: 4 },

  // Timestamp separator
  timestampRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, paddingHorizontal: 4 },
  timestampLine: { flex: 1, height: 1, backgroundColor: "#222" },
  timestampText: { fontSize: 11, color: "#555", marginHorizontal: 12, fontWeight: "500" },

  // System messages — with colored left border by type
  systemMsg: {
    paddingVertical: 6, paddingHorizontal: 12, marginVertical: 2,
    borderLeftWidth: 3, marginLeft: 4,
    backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 4,
  },
  systemText: { fontSize: 12, fontWeight: "500", lineHeight: 18 },

  // Chat messages
  chatMsg: {
    marginBottom: 2, padding: 10, paddingTop: 8,
    backgroundColor: "#16213e", borderRadius: 12,
    maxWidth: "82%", borderTopLeftRadius: 12, borderTopRightRadius: 12,
  },
  chatMsgMe: {
    alignSelf: "flex-end", backgroundColor: "#1a2744",
    borderBottomRightRadius: 4,
  },
  chatMsgGrouped: {
    marginTop: -1, borderTopLeftRadius: 4,
    paddingTop: 6,
  },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  chatName: { fontSize: 12, color: "#8888aa", fontWeight: "700" },
  chatTime: { fontSize: 10, color: "#555" },
  chatText: { fontSize: 14, color: "#e0e0e0", lineHeight: 20 },
  chatTextMe: { color: "#f0f0f0" },

  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#666", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#444", marginTop: 4 },

  // Scroll to bottom FAB
  scrollFab: { position: "absolute", right: 16, bottom: 70, zIndex: 10 },
  scrollFabBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#27272a", borderWidth: 1, borderColor: "#3f3f46",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  scrollFabArrow: { fontSize: 18, fontWeight: "800", color: "#fff" },
  unreadBadge: {
    position: "absolute", top: -6, right: -6,
    minWidth: 20, height: 20, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 5,
  },
  unreadText: { fontSize: 10, fontWeight: "800", color: "#fff" },

  // Input
  inputRow: { flexDirection: "row", gap: 8, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 4 : 8 },
  input: {
    flex: 1, backgroundColor: "#16213e", borderRadius: 22, paddingHorizontal: 18,
    paddingVertical: 11, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2a2a3e",
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: "center", alignItems: "center",
  },
  sendText: { fontSize: 18, fontWeight: "900" },
});
