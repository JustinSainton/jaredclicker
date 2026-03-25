// Chat — rich real-time messaging with reactions, @mentions, replies, GIFs
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Pressable, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Animated, Image, Modal, Keyboard,
} from "react-native";
import * as Haptics from "../lib/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame } from "../context/GameContext";
import { useOrg } from "../context/OrgContext";
import { api } from "../lib/api";
import { bodyStyle, headingStyle } from "../lib/theme-styles";
import t from "../lib/i18n";

const QUICK_REACTIONS = ["\uD83D\uDC4D", "\uD83D\uDE02", "\uD83D\uDD25", "\u2764\uFE0F", "\uD83D\uDE2E", "\uD83C\uDF89"];

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return time;
  if (diffDays === 1) return "Yesterday " + time;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

function shouldShowTimestamp(prev, curr) {
  if (!prev || !curr || !prev.timestamp || !curr.timestamp) return !prev;
  return curr.timestamp - prev.timestamp > 5 * 60 * 1000;
}

function isSameSenderGroup(prev, curr) {
  if (!prev || !curr || prev.type === "system" || curr.type === "system") return false;
  if (prev.name?.toLowerCase() !== curr.name?.toLowerCase()) return false;
  if (!prev.timestamp || !curr.timestamp) return true;
  return curr.timestamp - prev.timestamp < 60000;
}

const SYSTEM_COLORS = {
  default: "#888", sabotage: "#ef4444", campaign: "#f59e0b",
  battle: "#8b5cf6", admin: "#06b6d4", positive: "#4ade80", negative: "#ef4444",
};

function getSystemColor(message) {
  if (!message) return "#888";
  const m = message.toLowerCase();
  if (m.includes("sabotage") || m.includes("slowed") || m.includes("froze")) return SYSTEM_COLORS.sabotage;
  if (m.includes("campaign") || m.includes("coin cut") || m.includes("wipe")) return SYSTEM_COLORS.campaign;
  if (m.includes("battle") || m.includes("won") || m.includes("vs") || m.includes("\u2694")) return SYSTEM_COLORS.battle;
  if (m.includes("reset") || m.includes("admin")) return SYSTEM_COLORS.admin;
  if (m.includes("unbanned")) return SYSTEM_COLORS.positive;
  if (m.includes("banned")) return SYSTEM_COLORS.negative;
  return SYSTEM_COLORS.default;
}

// Highlight @mentions in message text
function renderMessageText(text, theme, playerName) {
  if (!text) return null;
  const parts = text.split(/(@\w+)/g);
  if (parts.length === 1) return <Text style={[styles.chatText, bodyStyle(theme)]}>{text}</Text>;
  return (
    <Text style={[styles.chatText, bodyStyle(theme)]}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const mentioned = part.slice(1).toLowerCase();
          const isMe = mentioned === playerName?.toLowerCase();
          return <Text key={i} style={[styles.mention, isMe && { backgroundColor: theme.primary + "33", color: theme.primary }]}>{part}</Text>;
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

export default function ChatScreen() {
  const { chatMessages, sendChat, sendReaction, player, online } = useGame();
  const { theme } = useOrg();
  const insets = useSafeAreaInsets();
  // Tab bar is ~50px + bottom safe area. Account for it in the input positioning.
  const tabBarHeight = 50 + insets.bottom;
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [hideSystem, setHideSystem] = useState(false);
  const listRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollBtnAnim = useRef(new Animated.Value(0)).current;
  const prevCountRef = useRef(0);
  const inputRef = useRef(null);

  const messagesWithKeys = useMemo(() => {
    const filtered = hideSystem ? chatMessages.filter(m => m.type !== "system") : chatMessages;
    return filtered.map((msg, i) => ({
      ...msg,
      _key: msg.id || "chat_" + (msg.timestamp || 0) + "_" + i,
      _prevMsg: i > 0 ? filtered[i - 1] : null,
    }));
  }, [chatMessages, hideSystem]);

  // Auto-scroll
  useEffect(() => {
    const count = chatMessages.length;
    if (count > prevCountRef.current && isAtBottom) {
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
    } else if (count > prevCountRef.current) {
      setUnreadCount(c => c + (count - prevCountRef.current));
    }
    prevCountRef.current = count;
  }, [chatMessages.length, isAtBottom]);

  useEffect(() => {
    Animated.spring(scrollBtnAnim, {
      toValue: (!isAtBottom && chatMessages.length > 5) ? 1 : 0,
      friction: 8, useNativeDriver: true,
    }).start();
  }, [isAtBottom, chatMessages.length]);

  const handleScroll = useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atBottom = contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd?.({ animated: true });
    setUnreadCount(0);
  }, []);

  // @mention handling
  const handleTextChange = useCallback((text) => {
    setMessage(text);
    // Detect @mention
    const match = text.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((name) => {
    setMessage(prev => prev.replace(/@\w*$/, "@" + name + " "));
    setMentionQuery(null);
    inputRef.current?.focus();
  }, []);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return (online || []).filter(n =>
      n.toLowerCase().startsWith(mentionQuery) && n.toLowerCase() !== player?.name?.toLowerCase()
    ).slice(0, 5);
  }, [mentionQuery, online, player]);

  // GIF search
  const searchGifs = useCallback(async (query) => {
    setGifLoading(true);
    try {
      const endpoint = query ? `/gifs/search?q=${encodeURIComponent(query)}&limit=20` : "/gifs/trending?limit=20";
      const data = await api.request(endpoint);
      setGifResults(data.gifs || []);
    } catch (e) { setGifResults([]); }
    setGifLoading(false);
  }, []);

  const openGifPicker = useCallback(() => {
    setShowGifPicker(true);
    searchGifs(""); // Load trending
  }, [searchGifs]);

  const sendGif = useCallback((gif) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendChat("", { gif: { url: gif.url, width: gif.width, height: gif.height } });
    setShowGifPicker(false);
    setGifSearch("");
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, [sendChat]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const opts = {};
    if (replyTo) opts.replyTo = { id: replyTo.id, name: replyTo.name, message: replyTo.message?.slice(0, 60) };
    sendChat(trimmed, opts);
    setMessage("");
    setReplyTo(null);
    setMentionQuery(null);
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 150);
  }, [message, sendChat, replyTo]);

  const handleReaction = useCallback((messageId, emoji) => {
    sendReaction(messageId, emoji);
    setReactionTarget(null);
  }, [sendReaction]);

  const renderMessage = useCallback(({ item }) => {
    const isSystem = item.type === "system";
    const isMe = item.name?.toLowerCase() === player?.name?.toLowerCase();
    const grouped = isSameSenderGroup(item._prevMsg, item);
    const showTime = shouldShowTimestamp(item._prevMsg, item);

    const timestampSep = showTime ? (
      <View style={styles.timestampRow}>
        <View style={styles.timestampLine} />
        <Text style={styles.timestampText}>{formatTimestamp(item.timestamp)}</Text>
        <View style={styles.timestampLine} />
      </View>
    ) : null;

    if (isSystem) {
      const color = getSystemColor(item.message);
      return (
        <View>
          {timestampSep}
          <View style={[styles.systemMsg, { borderLeftColor: color }]}>
            <Text style={[styles.systemText, { color }]}>{item.message}</Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        {timestampSep}
        <Pressable
          onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setReactionTarget(item); }}
          onPress={() => {}}
          delayLongPress={300}
        >
          <View style={[styles.chatMsg, isMe && styles.chatMsgMe, grouped && styles.chatMsgGrouped]}>
            {/* Reply preview */}
            {item.replyTo && (
              <View style={styles.replyPreview}>
                <Text style={styles.replyName}>{item.replyTo.name}</Text>
                <Text style={styles.replyText} numberOfLines={1}>{item.replyTo.message}</Text>
              </View>
            )}
            {!grouped && (
              <View style={styles.chatHeader}>
                <Text style={[styles.chatName, isMe && { color: theme.primary }]}>{item.name}</Text>
                <Text style={styles.chatTime}>{formatTimestamp(item.timestamp)}</Text>
              </View>
            )}
            {/* GIF */}
            {item.gif && item.gif.url ? (
              <Image source={{ uri: item.gif.url }} style={styles.gifImage} resizeMode="cover" />
            ) : null}
            {item.message ? renderMessageText(item.message, theme, player?.name) : null}
            {/* Reactions */}
            {item.reactions && Object.keys(item.reactions).length > 0 && (
              <View style={styles.reactionsRow}>
                {Object.entries(item.reactions).map(([emoji, names]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionPill, names.includes(player?.name) && { borderColor: theme.primary }]}
                    onPress={() => handleReaction(item.id, emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={styles.reactionCount}>{names.length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* Quick reply button */}
          {!isMe && !grouped && (
            <TouchableOpacity style={styles.replyBtn} onPress={() => { setReplyTo(item); inputRef.current?.focus(); }}>
              <Text style={styles.replyBtnText}>Reply</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </View>
    );
  }, [player, theme, handleReaction]);

  return (
    <KeyboardAvoidingView style={[styles.container, { marginBottom: tabBarHeight + 12 }]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={tabBarHeight + 56}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.header, headingStyle(theme), { color: theme.primary }]}>Chat</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            onPress={() => setHideSystem(h => !h)}
            style={[styles.systemToggle, hideSystem && { borderColor: theme.primary, backgroundColor: theme.primary + "15" }]}
          >
            <Text style={[styles.systemToggleText, hideSystem && { color: theme.primary }]}>
              {hideSystem ? "\uD83D\uDD15 Quiet" : "\uD83D\uDD14 All"}
            </Text>
          </TouchableOpacity>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{online?.length || 0} online</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messagesWithKeys}
        renderItem={renderMessage}
        keyExtractor={(item) => item._key}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (isAtBottom) listRef.current?.scrollToEnd?.({ animated: false });
        }}
        onLayout={() => {
          listRef.current?.scrollToEnd?.({ animated: false });
        }}
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
        style={[styles.scrollFab, { transform: [{ scale: scrollBtnAnim }], opacity: scrollBtnAnim }]}
        pointerEvents={isAtBottom ? "none" : "auto"}
      >
        <TouchableOpacity style={styles.scrollFabBtn} onPress={scrollToBottom}>
          <Text style={styles.scrollFabArrow}>{"\u2193"}</Text>
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* @mention suggestions */}
      {mentionSuggestions.length > 0 && (
        <View style={styles.mentionList}>
          {mentionSuggestions.map(name => (
            <TouchableOpacity key={name} style={styles.mentionItem} onPress={() => insertMention(name)}>
              <Text style={styles.mentionName}>@{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBarLabel}>Replying to <Text style={{ color: theme.primary }}>{replyTo.name}</Text></Text>
            <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.message}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={styles.replyBarClose}>{"\u2715"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.gifBtn} onPress={openGifPicker}>
          <Text style={styles.gifBtnText}>GIF</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={message}
          onChangeText={handleTextChange}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          autoCorrect={true}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: message.trim() ? theme.primary : "#333" }]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Text style={[styles.sendIcon, { color: message.trim() ? "#1a1a2e" : "#666" }]}>{"\u2191"}</Text>
        </TouchableOpacity>
      </View>

      {/* GIF Picker Modal */}
      <Modal visible={showGifPicker} animationType="slide" transparent onRequestClose={() => setShowGifPicker(false)}>
        <View style={styles.gifModal}>
          <View style={styles.gifHeader}>
            <Text style={[styles.gifTitle, { color: theme.primary }]}>GIFs</Text>
            <TouchableOpacity onPress={() => setShowGifPicker(false)}>
              <Text style={styles.gifClose}>{"\u2715"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gifSearchRow}>
            <TextInput
              style={styles.gifSearchInput}
              value={gifSearch}
              onChangeText={(t) => { setGifSearch(t); }}
              onSubmitEditing={() => searchGifs(gifSearch)}
              placeholder="Search GIFs..."
              placeholderTextColor="#666"
              returnKeyType="search"
              autoFocus
              letterSpacing={0}
            />
            <TouchableOpacity style={[styles.gifSearchBtn, { backgroundColor: theme.primary }]} onPress={() => searchGifs(gifSearch)}>
              <Text style={{ color: "#1a1a2e", fontWeight: "700", fontSize: 13 }}>Search</Text>
            </TouchableOpacity>
          </View>
          {gifLoading ? (
            <View style={styles.gifLoading}><Text style={{ color: "#888" }}>Loading...</Text></View>
          ) : (
            <FlatList
              data={gifResults}
              numColumns={2}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.gifGrid}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.gifItem} onPress={() => sendGif(item)}>
                  <Image source={{ uri: item.preview || item.url }} style={styles.gifThumb} resizeMode="cover" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<View style={styles.gifLoading}><Text style={{ color: "#888" }}>No GIFs found</Text></View>}
            />
          )}
          <Text style={styles.gifAttrib}>Powered by Tenor</Text>
        </View>
      </Modal>

      {/* Reaction picker modal */}
      <Modal transparent visible={!!reactionTarget} animationType="fade" onRequestClose={() => setReactionTarget(null)}>
        <Pressable style={styles.reactionOverlay} onPress={() => setReactionTarget(null)}>
          <View style={styles.reactionPicker}>
            {reactionTarget && (
              <View style={styles.reactionPreview}>
                <Text style={styles.reactionPreviewName}>{reactionTarget.name}</Text>
                <Text style={styles.reactionPreviewText} numberOfLines={2}>{reactionTarget.message}</Text>
              </View>
            )}
            <View style={styles.reactionRow}>
              {QUICK_REACTIONS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionOption}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleReaction(reactionTarget?.id, emoji); }}
                >
                  <Text style={styles.reactionOptionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.reactionReplyBtn} onPress={() => { setReplyTo(reactionTarget); setReactionTarget(null); inputRef.current?.focus(); }}>
              <Text style={styles.reactionReplyText}>Reply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  header: { fontSize: 24, fontWeight: "800" },
  systemToggle: { borderRadius: 10, borderWidth: 1, borderColor: "#333", paddingHorizontal: 10, paddingVertical: 4 },
  systemToggleText: { fontSize: 11, fontWeight: "700", color: "#888" },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16213e", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  onlineText: { fontSize: 12, color: "#4ade80", fontWeight: "600" },
  list: { flex: 1 },
  listContent: { paddingBottom: 8, paddingTop: 4 },
  // Timestamps
  timestampRow: { flexDirection: "row", alignItems: "center", marginVertical: 12 },
  timestampLine: { flex: 1, height: 1, backgroundColor: "#222" },
  timestampText: { fontSize: 11, color: "#999", marginHorizontal: 12, fontWeight: "500" },
  // System messages
  systemMsg: { paddingVertical: 6, paddingHorizontal: 12, marginVertical: 2, borderLeftWidth: 3, marginLeft: 4, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 4 },
  systemText: { fontSize: 12, fontWeight: "500", lineHeight: 18 },
  // Chat messages
  chatMsg: { marginBottom: 2, padding: 10, paddingTop: 8, backgroundColor: "#16213e", borderRadius: 12, maxWidth: "82%", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  chatMsgMe: { alignSelf: "flex-end", backgroundColor: "#1a2744", borderBottomRightRadius: 4 },
  chatMsgGrouped: { marginTop: -1, borderTopLeftRadius: 4, paddingTop: 6 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  chatName: { fontSize: 12, color: "#8888aa", fontWeight: "700" },
  chatTime: { fontSize: 10, color: "#999" },
  chatText: { fontSize: 14, color: "#e0e0e0", lineHeight: 20 },
  // @mentions
  mention: { fontWeight: "700", color: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.12)", borderRadius: 3, paddingHorizontal: 2 },
  // Reply preview in message
  replyPreview: { backgroundColor: "rgba(255,255,255,0.05)", borderLeftWidth: 2, borderLeftColor: "#8b5cf6", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  replyName: { fontSize: 11, color: "#8b5cf6", fontWeight: "700" },
  replyText: { fontSize: 12, color: "#aaa", marginTop: 1 },
  // Reply button
  replyBtn: { marginLeft: 12, marginBottom: 4 },
  replyBtnText: { fontSize: 11, color: "#999", fontWeight: "600" },
  // GIF
  gifImage: { width: 200, height: 150, borderRadius: 8, marginTop: 4, marginBottom: 4 },
  // Reactions
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  reactionPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "transparent" },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: "#888", fontWeight: "600" },
  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#aaa", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#888", marginTop: 4 },
  // Scroll FAB
  scrollFab: { position: "absolute", right: 16, bottom: 80, zIndex: 10 },
  scrollFabBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#27272a", borderWidth: 1, borderColor: "#3f3f46", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  scrollFabArrow: { fontSize: 18, fontWeight: "800", color: "#fff" },
  unreadBadge: { position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  // @mention suggestions
  mentionList: { backgroundColor: "#1c1c28", borderRadius: 12, borderWidth: 1, borderColor: "#2a2a3e", marginBottom: 4, overflow: "hidden" },
  mentionItem: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#222" },
  mentionName: { fontSize: 14, color: "#8b5cf6", fontWeight: "600" },
  // Reply bar
  replyBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#1c1c28", borderRadius: 10, padding: 10, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: "#8b5cf6" },
  replyBarLabel: { fontSize: 12, color: "#888", fontWeight: "600" },
  replyBarText: { fontSize: 13, color: "#aaa", marginTop: 2 },
  replyBarClose: { fontSize: 16, color: "#aaa", paddingLeft: 12 },
  // Input
  inputRow: { flexDirection: "row", gap: 8, paddingTop: 8, paddingBottom: 8 },
  input: { flex: 1, backgroundColor: "#16213e", borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2a2a3e", letterSpacing: 0 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  sendIcon: { fontSize: 20, fontWeight: "800" },
  // GIF button
  gifBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1c1c28", borderWidth: 1, borderColor: "#2a2a3e", justifyContent: "center", alignItems: "center" },
  gifBtnText: { fontSize: 11, fontWeight: "800", color: "#888" },
  // GIF modal
  gifModal: { flex: 1, backgroundColor: "#0f0f16", paddingTop: 60 },
  gifHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12 },
  gifTitle: { fontSize: 20, fontWeight: "800" },
  gifClose: { fontSize: 20, color: "#888", padding: 8 },
  gifSearchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  gifSearchInput: { flex: 1, backgroundColor: "#1c1c28", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2a2a3e", letterSpacing: 0 },
  gifSearchBtn: { paddingHorizontal: 16, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  gifGrid: { paddingHorizontal: 12 },
  gifItem: { flex: 1, margin: 4, borderRadius: 8, overflow: "hidden", backgroundColor: "#1c1c28" },
  gifThumb: { width: "100%", aspectRatio: 1, borderRadius: 8 },
  gifLoading: { alignItems: "center", paddingTop: 40 },
  gifAttrib: { textAlign: "center", fontSize: 10, color: "#555", padding: 8 },
  // Reaction picker modal
  reactionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  reactionPicker: { backgroundColor: "#1c1c28", borderRadius: 20, padding: 20, width: "85%", maxWidth: 340, borderWidth: 1, borderColor: "#2a2a3e" },
  reactionPreview: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12, marginBottom: 16 },
  reactionPreviewName: { fontSize: 12, color: "#8888aa", fontWeight: "700", marginBottom: 4 },
  reactionPreviewText: { fontSize: 14, color: "#ccc" },
  reactionRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 12 },
  reactionOption: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "center", alignItems: "center" },
  reactionOptionEmoji: { fontSize: 24 },
  reactionReplyBtn: { backgroundColor: "#16213e", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#2a2a3e" },
  reactionReplyText: { fontSize: 14, fontWeight: "600", color: "#888" },
});
