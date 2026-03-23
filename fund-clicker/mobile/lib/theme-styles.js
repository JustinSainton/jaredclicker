// Theme style helpers — generate React Native style objects from vibe design tokens
// Components use these instead of manually reading individual theme properties.

/**
 * Heading text style (titles, section headers)
 * Applies: font family, text shadow, font size from tokens
 */
export function headingStyle(theme) {
  const s = {};
  if (theme.headingFont) s.fontFamily = theme.headingFont;
  if (theme.headingSize) s.fontSize = theme.headingSize;
  if (theme.textShadow) {
    s.textShadowColor = theme.textShadow.color;
    s.textShadowOffset = { width: theme.textShadow.width, height: theme.textShadow.height };
    s.textShadowRadius = theme.textShadow.radius;
  }
  return s;
}

/**
 * Score/number display style
 * Applies: score font, heavy text shadow, score size
 */
export function scoreStyle(theme) {
  const s = {};
  if (theme.scoreFont) s.fontFamily = theme.scoreFont;
  if (theme.scoreSize) s.fontSize = theme.scoreSize;
  if (theme.scoreTextShadow) {
    s.textShadowColor = theme.scoreTextShadow.color;
    s.textShadowOffset = { width: theme.scoreTextShadow.width, height: theme.scoreTextShadow.height };
    s.textShadowRadius = theme.scoreTextShadow.radius;
  }
  return s;
}

/**
 * Body text style
 */
export function bodyStyle(theme) {
  const s = {};
  if (theme.bodyFont) s.fontFamily = theme.bodyFont;
  if (theme.bodySize) s.fontSize = theme.bodySize;
  return s;
}

/**
 * Label style (small uppercase text)
 */
export function labelStyle(theme) {
  const s = {};
  if (theme.labelFont) s.fontFamily = theme.labelFont;
  if (theme.labelSize) s.fontSize = theme.labelSize;
  return s;
}

/**
 * Floating number style ("+X" that floats up on click)
 */
export function floatNumberStyle(theme) {
  const s = { color: theme.primary };
  if (theme.scoreFont) s.fontFamily = theme.scoreFont;
  if (theme.floatNumberSize) s.fontSize = theme.floatNumberSize;
  if (theme.textShadow) {
    s.textShadowColor = theme.textShadow.color;
    s.textShadowOffset = { width: theme.textShadow.width, height: theme.textShadow.height };
    s.textShadowRadius = theme.textShadow.radius;
  }
  return s;
}

/**
 * Card/container border style matching the vibe
 */
export function cardStyle(theme, highlighted = false) {
  return {
    borderWidth: highlighted ? theme.borderWidth : theme.borderWidthThin || 1,
    borderColor: highlighted ? theme.borderColor : (theme.borderColorMuted || "#1e2a45"),
    borderRadius: theme.borderRadius || 12,
    backgroundColor: theme.surface || "#16213e",
  };
}

/**
 * Highlighted card (active state, selected item)
 */
export function cardActiveStyle(theme) {
  return {
    borderWidth: theme.borderWidth || 2,
    borderColor: theme.primary,
    borderRadius: theme.borderRadius || 12,
    backgroundColor: theme.surface || "#16213e",
  };
}

/**
 * Glow shadow effect for key elements (coin button, achievements, etc.)
 */
export function glowStyle(theme, variant = "primary") {
  const g = theme.glow?.[variant] || theme.glow?.primary || { radius: 10, color: "rgba(255,215,0,0.3)" };
  return {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: g.radius,
    elevation: Math.min(15, Math.round(g.radius / 2)),
  };
}

/**
 * Subtle glow for backgrounds/surfaces
 */
export function subtleGlowStyle(theme) {
  return glowStyle(theme, "primarySubtle");
}

/**
 * Green text style (success, per-second income)
 */
export function successTextStyle(theme) {
  const s = { color: theme.success };
  if (theme.greenShadow) {
    s.textShadowColor = theme.greenShadow.color;
    s.textShadowOffset = { width: theme.greenShadow.width, height: theme.greenShadow.height };
    s.textShadowRadius = theme.greenShadow.radius;
  }
  return s;
}

/**
 * Red text style (danger, sabotage)
 */
export function dangerTextStyle(theme) {
  const s = { color: theme.danger };
  if (theme.redShadow) {
    s.textShadowColor = theme.redShadow.color;
    s.textShadowOffset = { width: theme.redShadow.width, height: theme.redShadow.height };
    s.textShadowRadius = theme.redShadow.radius;
  }
  return s;
}

/**
 * Spring animation config from vibe
 */
export function springConfig(theme) {
  const anim = theme.animation || {};
  return {
    friction: anim.springFriction || 5,
    tension: anim.springTension || 180,
  };
}
