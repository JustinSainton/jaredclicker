// Local vibe assets — bundled in the app for instant loading
// These are require()'d at build time so they're embedded in the binary

const VIBE_ASSETS = {
  "retro-arcade": {
    coin: require("../assets/vibes/retro-arcade/coin.png"),
    background: require("../assets/vibes/retro-arcade/background.png"),
    tab_click: require("../assets/vibes/retro-arcade/tab_click.png"),
    tab_board: require("../assets/vibes/retro-arcade/tab_board.png"),
    tab_battle: require("../assets/vibes/retro-arcade/tab_battle.png"),
    tab_shop: require("../assets/vibes/retro-arcade/tab_shop.png"),
    tab_skins: require("../assets/vibes/retro-arcade/tab_skins.png"),
  },
  "modern-minimal": {
    coin: require("../assets/vibes/modern-minimal/coin.png"),
    background: require("../assets/vibes/modern-minimal/background.png"),
    tab_click: require("../assets/vibes/modern-minimal/tab_click.png"),
    tab_board: require("../assets/vibes/modern-minimal/tab_board.png"),
    tab_battle: require("../assets/vibes/modern-minimal/tab_battle.png"),
    tab_shop: require("../assets/vibes/modern-minimal/tab_shop.png"),
    tab_skins: require("../assets/vibes/modern-minimal/tab_skins.png"),
  },
  "nature-earth": {
    coin: require("../assets/vibes/nature-earth/coin.png"),
    background: require("../assets/vibes/nature-earth/background.png"),
    tab_click: require("../assets/vibes/nature-earth/tab_click.png"),
    tab_board: require("../assets/vibes/nature-earth/tab_board.png"),
    tab_battle: require("../assets/vibes/nature-earth/tab_battle.png"),
    tab_shop: require("../assets/vibes/nature-earth/tab_shop.png"),
    tab_skins: require("../assets/vibes/nature-earth/tab_skins.png"),
  },
  "neon-cyber": {
    coin: require("../assets/vibes/neon-cyber/coin.png"),
    background: require("../assets/vibes/neon-cyber/background.png"),
    tab_click: require("../assets/vibes/neon-cyber/tab_click.png"),
    tab_board: require("../assets/vibes/neon-cyber/tab_board.png"),
    tab_battle: require("../assets/vibes/neon-cyber/tab_battle.png"),
    tab_shop: require("../assets/vibes/neon-cyber/tab_shop.png"),
    tab_skins: require("../assets/vibes/neon-cyber/tab_skins.png"),
  },
  "pastel-pop": {
    coin: require("../assets/vibes/pastel-pop/coin.png"),
    background: require("../assets/vibes/pastel-pop/background.png"),
    tab_click: require("../assets/vibes/pastel-pop/tab_click.png"),
    tab_board: require("../assets/vibes/pastel-pop/tab_board.png"),
    tab_battle: require("../assets/vibes/pastel-pop/tab_battle.png"),
    tab_shop: require("../assets/vibes/pastel-pop/tab_shop.png"),
    tab_skins: require("../assets/vibes/pastel-pop/tab_skins.png"),
  },
  "classic-gold": {
    coin: require("../assets/vibes/classic-gold/coin.png"),
    background: require("../assets/vibes/classic-gold/background.png"),
    tab_click: require("../assets/vibes/classic-gold/tab_click.png"),
    tab_board: require("../assets/vibes/classic-gold/tab_board.png"),
    tab_battle: require("../assets/vibes/classic-gold/tab_battle.png"),
    tab_shop: require("../assets/vibes/classic-gold/tab_shop.png"),
    tab_skins: require("../assets/vibes/classic-gold/tab_skins.png"),
  },
};

/**
 * Get a local asset for a vibe. Falls back to remote URL if not bundled.
 * @param {string} vibeId - The vibe identifier
 * @param {string} assetName - Asset name (coin, background, tab_click, etc.)
 * @returns {number|{uri: string}} - require() result or remote URI object
 */
export function getVibeAsset(vibeId, assetName) {
  const vibe = VIBE_ASSETS[vibeId];
  if (vibe && vibe[assetName]) return vibe[assetName];
  // Fallback to remote
  return { uri: `https://api.fundclicker.com/vibes/${vibeId}/${assetName}.png` };
}

export default VIBE_ASSETS;
