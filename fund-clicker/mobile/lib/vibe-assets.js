// Local vibe assets — bundled in the app for instant loading
// These are require()'d at build time so they're embedded in the binary

const VIBE_ASSETS = {
  "retro-arcade": {
    coin: require("../assets/vibes/retro-arcade/coin.jpg"),
    background: require("../assets/vibes/retro-arcade/background.jpg"),
    tab_click: require("../assets/vibes/retro-arcade/tab_click.jpg"),
    tab_board: require("../assets/vibes/retro-arcade/tab_board.jpg"),
    tab_battle: require("../assets/vibes/retro-arcade/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/retro-arcade/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/retro-arcade/tab_skins.jpg"),
  },
  "modern-minimal": {
    coin: require("../assets/vibes/modern-minimal/coin.jpg"),
    background: require("../assets/vibes/modern-minimal/background.jpg"),
    tab_click: require("../assets/vibes/modern-minimal/tab_click.jpg"),
    tab_board: require("../assets/vibes/modern-minimal/tab_board.jpg"),
    tab_battle: require("../assets/vibes/modern-minimal/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/modern-minimal/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/modern-minimal/tab_skins.jpg"),
  },
  "nature-earth": {
    coin: require("../assets/vibes/nature-earth/coin.jpg"),
    background: require("../assets/vibes/nature-earth/background.jpg"),
    tab_click: require("../assets/vibes/nature-earth/tab_click.jpg"),
    tab_board: require("../assets/vibes/nature-earth/tab_board.jpg"),
    tab_battle: require("../assets/vibes/nature-earth/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/nature-earth/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/nature-earth/tab_skins.jpg"),
  },
  "neon-cyber": {
    coin: require("../assets/vibes/neon-cyber/coin.jpg"),
    background: require("../assets/vibes/neon-cyber/background.jpg"),
    tab_click: require("../assets/vibes/neon-cyber/tab_click.jpg"),
    tab_board: require("../assets/vibes/neon-cyber/tab_board.jpg"),
    tab_battle: require("../assets/vibes/neon-cyber/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/neon-cyber/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/neon-cyber/tab_skins.jpg"),
  },
  "pastel-pop": {
    coin: require("../assets/vibes/pastel-pop/coin.jpg"),
    background: require("../assets/vibes/pastel-pop/background.jpg"),
    tab_click: require("../assets/vibes/pastel-pop/tab_click.jpg"),
    tab_board: require("../assets/vibes/pastel-pop/tab_board.jpg"),
    tab_battle: require("../assets/vibes/pastel-pop/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/pastel-pop/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/pastel-pop/tab_skins.jpg"),
  },
  "classic-gold": {
    coin: require("../assets/vibes/classic-gold/coin.jpg"),
    background: require("../assets/vibes/classic-gold/background.jpg"),
    tab_click: require("../assets/vibes/classic-gold/tab_click.jpg"),
    tab_board: require("../assets/vibes/classic-gold/tab_board.jpg"),
    tab_battle: require("../assets/vibes/classic-gold/tab_battle.jpg"),
    tab_shop: require("../assets/vibes/classic-gold/tab_shop.jpg"),
    tab_skins: require("../assets/vibes/classic-gold/tab_skins.jpg"),
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
