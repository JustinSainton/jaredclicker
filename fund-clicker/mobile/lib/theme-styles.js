// Theme style helpers — generate React Native style objects from vibe theme
// Use these in components instead of manually checking theme.scoreFont etc.

/**
 * Returns a style object for heading text (titles, section headers)
 */
export function headingStyle(theme) {
  const s = {};
  if (theme.headingFont) s.fontFamily = theme.headingFont;
  if (theme.textShadow) {
    s.textShadowColor = theme.textShadow.color;
    s.textShadowOffset = { width: theme.textShadow.width, height: theme.textShadow.height };
    s.textShadowRadius = theme.textShadow.radius;
  }
  return s;
}

/**
 * Returns a style object for score/number displays
 */
export function scoreStyle(theme) {
  const s = {};
  if (theme.scoreFont) s.fontFamily = theme.scoreFont;
  if (theme.scoreTextShadow) {
    s.textShadowColor = theme.scoreTextShadow.color;
    s.textShadowOffset = { width: theme.scoreTextShadow.width, height: theme.scoreTextShadow.height };
    s.textShadowRadius = theme.scoreTextShadow.radius;
  }
  return s;
}

/**
 * Returns a style object for body text
 */
export function bodyStyle(theme) {
  const s = {};
  if (theme.bodyFont) s.fontFamily = theme.bodyFont;
  return s;
}

/**
 * Returns a style object for labels (uppercase small text)
 */
export function labelStyle(theme) {
  const s = {};
  if (theme.labelFont) s.fontFamily = theme.labelFont;
  return s;
}

/**
 * Returns a style object for card/container borders matching the vibe
 */
export function cardBorderStyle(theme, highlighted = false) {
  return {
    borderWidth: theme.borderWidth || 1,
    borderColor: highlighted ? theme.primary : (theme.surface || "#1e2a45"),
    borderRadius: theme.borderRadius || 12,
  };
}

/**
 * Returns a style object for glow shadow on key elements
 */
export function glowStyle(theme) {
  return {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: theme.glowRadius || 10,
    elevation: 10,
  };
}
