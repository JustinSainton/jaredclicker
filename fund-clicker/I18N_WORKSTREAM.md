# Fund Clicker i18n Workstream

Status: in progress
Owner: Codex follow-up pass
Last updated: 2026-03-21

## Rule

- Do not add new user-facing English strings without also adding `mobile/lib/i18n.js` keys.

## Immediate cleanup

- done: `mobile/components/ShopScreen.js`
- done: `mobile/components/SkinsScreen.js`
- done: `mobile/components/BattleScreen.js`
- done: `mobile/components/ChatScreen.js`
- done: `mobile/components/ProfileScreen.js`
- done: `mobile/app/game/[slug].js`
- done: `mobile/components/BanOverlay.js`
- done: `mobile/components/LeaderboardScreen.js`
- done: `mobile/components/ClickerScreen.js`
- done: `mobile/app/index.js`
- done: `mobile/components/AdminDashboard.js`
- done: `mobile/components/CampaignsList.js`
- done: `mobile/components/GroupGameLobby.js`
- done: `mobile/components/SpectatorView.js`
- done: `mobile/components/games/ActiveGameModal.js`
- done: `mobile/components/games/BattleshipGame.js`
- done: `mobile/components/games/ClickerDuelGame.js`
- done: `mobile/components/games/CoinFlipGame.js`
- done: `mobile/components/games/Connect4Game.js`
- done: `mobile/components/games/HangmanGame.js`
- done: `mobile/components/games/RPSGame.js`
- done: `mobile/components/games/ReactionGame.js`
- done: `mobile/components/games/TTTGame.js`
- done: `mobile/components/games/TriviaGame.js`

## Broader pass

- done: audited `mobile/components/*` for hardcoded English.
- done: expanded `mobile/lib/i18n.js` with payment-sync, battle, leaderboard, admin, campaign, spectator, and minigame strings.
- done: replaced inline `Alert.alert(...)` strings with translation keys in the remaining backlog.
- done: `npm run i18n:report` in `mobile/` currently returns `No hardcoded copy candidates found.`
- done: backfilled the newly centralized strings for `es`, `pt`, `fr`, `de`, `ja`, and `ko` so the latest shipping flows rely less on English fallback.
- open: continue backfilling older legacy keys that still fall back to English outside the recently touched screens.
- open: add a lint/check step that fails on new raw UI copy outside the i18n layer once the current dependency/build blockers are cleared.
