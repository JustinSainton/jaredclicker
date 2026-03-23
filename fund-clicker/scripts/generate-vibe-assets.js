#!/usr/bin/env node
// Generate complete vibe asset sets via Gemini API and upload to R2
// Usage: GEMINI_API_KEY=your_key node scripts/generate-vibe-assets.js [vibeId]
//
// Each vibe gets: coin, background, particle, icon, splash
// Plus 5 tab icons: click, shop, board, battle, skins
//
// Omit vibeId to generate all 6 vibes.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: Set GEMINI_API_KEY environment variable");
  process.exit(1);
}

const MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ─── ASSET DEFINITIONS PER VIBE ──────────────────────────────────────────────

const VIBES = {
  "retro-arcade": {
    style: "8-bit pixel art retro arcade style with neon glow effects, dark background, vibrant gold and neon colors",
    assets: {
      coin: "A golden pixel art coin with a dollar sign embossed in the center. Neon gold edges glowing. Pixel art style with visible pixels. Dark transparent background. 1024x1024.",
      background: "A seamless dark background texture for a retro arcade game. Subtle pixel grid pattern in dark navy (#1a1a2e to #0f3460 gradient). Faint neon grid lines. Stars or tiny pixel dots scattered. Tileable. 1024x1024.",
      particle: "A small golden pixel art star/sparkle sprite for particle effects. 8-bit retro style. Glowing neon gold. Transparent background. Simple shape. 256x256.",
      icon: "A pixel art game controller icon in golden neon style. 8-bit retro aesthetic. Glowing gold on dark transparent background. Simple recognizable shape. 512x512.",
      splash: "A retro arcade title screen background. Dark navy with neon gold border frame. Pixel art style. Grid lines. Glowing 'FUND CLICKER' text area in center (leave space for text overlay). Stars and pixel decorations. 1024x1024.",
      tab_click: "A pixel art golden coin icon, 8-bit style, small and simple, neon gold glow, dark transparent background, 128x128.",
      tab_shop: "A pixel art treasure chest icon, 8-bit style, golden coins spilling out, neon glow, dark transparent background, 128x128.",
      tab_board: "A pixel art golden trophy icon, 8-bit style, first place trophy, neon glow, dark transparent background, 128x128.",
      tab_battle: "Pixel art crossed swords icon, 8-bit style, golden blades, neon glow, dark transparent background, 128x128.",
      tab_skins: "A pixel art paint palette icon, 8-bit style, colorful paint blobs, neon glow, dark transparent background, 128x128.",
    },
  },
  "modern-minimal": {
    style: "sleek modern minimal design with clean lines, subtle gradients, indigo and violet tones, sophisticated and professional",
    assets: {
      coin: "A sleek modern coin with an indigo to violet gradient surface. Minimalist design with clean smooth beveled edges. A subtle dollar sign etched into the center. Dark transparent background. 1024x1024.",
      background: "A clean minimal dark background. Smooth gradient from #0f172a to #1e293b. Very subtle noise texture. No patterns or decorations. Ultra clean. 1024x1024.",
      particle: "A simple smooth circle with a soft indigo glow. Minimal style. Gradient from indigo center to transparent edges. Clean anti-aliased. Transparent background. 256x256.",
      icon: "A minimal geometric logo mark. Clean indigo circle with a subtle arrow or chart line inside. Professional SaaS aesthetic. Transparent background. 512x512.",
      splash: "A minimal dark splash screen background. Smooth gradient #0f172a to #1e293b. Single subtle indigo circle glow in center. Ultra clean, no decorations. 1024x1024.",
      tab_click: "A minimal coin icon, clean smooth circle with subtle dollar sign, indigo gradient, transparent background, 128x128.",
      tab_shop: "A minimal shopping bag icon, clean lines, indigo color, no extra details, transparent background, 128x128.",
      tab_board: "A minimal chart/ranking icon with ascending bars, clean lines, indigo gradient, transparent background, 128x128.",
      tab_battle: "A minimal lightning bolt icon, clean geometric shape, indigo color, transparent background, 128x128.",
      tab_skins: "A minimal palette/brush icon, clean lines, indigo color, transparent background, 128x128.",
    },
  },
  "nature-earth": {
    style: "warm organic natural style with wood textures, earth tones, amber and green colors, handcrafted rustic feel",
    assets: {
      coin: "A rustic wooden coin with leaf and vine engravings around the rim. Warm amber and brown tones. Organic wood grain texture. A tree symbol in the center. Dark transparent background. 1024x1024.",
      background: "A warm earthy background texture. Dark brown wood grain or stone texture. Subtle leaf patterns at edges. Warm amber tones (#1c1917 base). Natural organic feel. 1024x1024.",
      particle: "A small falling leaf sprite. Warm amber/green colored leaf. Natural organic shape. Transparent background. Simple and clean. 256x256.",
      icon: "A tree of life icon in warm amber/brown tones. Organic branches forming a circle. Natural handcrafted style. Transparent background. 512x512.",
      splash: "An earthy nature splash background. Dark wood texture with warm amber vignette. Subtle vine decorations at corners. Natural organic warmth. Space for text in center. 1024x1024.",
      tab_click: "A wooden coin icon with leaf engraving, warm amber tones, organic style, transparent background, 128x128.",
      tab_shop: "A wooden crate or basket icon, warm brown tones, rustic style, transparent background, 128x128.",
      tab_board: "A wooden trophy/totem icon, carved wood style, warm amber, transparent background, 128x128.",
      tab_battle: "Crossed wooden staffs icon, rustic natural style, warm brown tones, transparent background, 128x128.",
      tab_skins: "A leaf palette icon, natural colors, organic shape, transparent background, 128x128.",
    },
  },
  "neon-cyber": {
    style: "cyberpunk neon aesthetic with electric cyan and hot pink, circuit board patterns, dark tech backgrounds, futuristic and edgy",
    assets: {
      coin: "A holographic cyan neon circuit board coin. Glowing electric cyan edges with circuit trace patterns. Glowing digital dollar sign in center. Cyberpunk aesthetic. Dark transparent background. 1024x1024.",
      background: "A dark cyberpunk background. Near-black (#020617) with subtle cyan circuit trace lines. Digital grid pattern. Faint neon glow at edges. Tech aesthetic. 1024x1024.",
      particle: "A small neon cyan hexagon or diamond shape. Electric glow effect. Cyberpunk style. Sharp edges. Transparent background. 256x256.",
      icon: "A neon cyberpunk logo mark. Glowing cyan circuit chip or digital eye. Sharp geometric. Electric glow. Dark transparent background. 512x512.",
      splash: "A cyberpunk splash background. Dark near-black with neon cyan circuit traces forming a border. Digital rain effect. Glowing lines. Futuristic grid. 1024x1024.",
      tab_click: "A neon cyan digital coin icon, circuit pattern, electric glow, cyberpunk style, dark transparent background, 128x128.",
      tab_shop: "A neon cyan shopping cart or credit chip icon, cyberpunk style, electric glow, dark transparent background, 128x128.",
      tab_board: "A neon cyan ranking/chart icon with digital display style, cyberpunk, electric glow, dark transparent background, 128x128.",
      tab_battle: "Neon cyan crossed laser swords, cyberpunk style, electric glow trails, dark transparent background, 128x128.",
      tab_skins: "A neon cyan hologram cube icon, cyberpunk customization style, electric glow, dark transparent background, 128x128.",
    },
  },
  "pastel-pop": {
    style: "soft pastel colors with bubbly playful shapes, light backgrounds, purple pink and orange tones, joyful kid-friendly aesthetic with sparkles",
    assets: {
      coin: "A soft pastel purple and pink gradient coin with a star shape cutout in the center. Bubbly playful style with light sparkle effects. Rounded soft edges. Light transparent background. 1024x1024.",
      background: "A light pastel background. Soft gradient from lavender (#faf5ff) to light purple (#f3e8ff). Subtle floating bubbles or stars. Dreamy soft feel. No harsh colors. 1024x1024.",
      particle: "A small pastel star or heart shape. Soft purple/pink gradient. Sparkle effect. Bubbly rounded shape. Transparent background. Cute and playful. 256x256.",
      icon: "A cute bubbly star icon in pastel purple and pink. Rounded soft shapes. Sparkle accents. Playful joyful. Transparent background. 512x512.",
      splash: "A soft pastel splash background. Light lavender to pink gradient. Floating stars and bubbles. Rainbow accent. Dreamy magical feel. Joyful and light. 1024x1024.",
      tab_click: "A cute pastel coin icon, soft purple-pink, bubbly rounded shape, sparkles, light transparent background, 128x128.",
      tab_shop: "A cute pastel gift box icon, soft purple with orange bow, bubbly style, sparkles, light transparent background, 128x128.",
      tab_board: "A cute pastel crown or star trophy, soft purple-pink, bubbly rounded, sparkles, light transparent background, 128x128.",
      tab_battle: "Cute pastel crossed wands with stars, soft purple-pink, bubbly playful, sparkles, light transparent background, 128x128.",
      tab_skins: "A cute pastel rainbow paintbrush icon, soft colors, bubbly shape, sparkles, light transparent background, 128x128.",
    },
  },
  "classic-gold": {
    style: "elegant classical design with rich deep gold, ornate baroque details, deep navy backgrounds, timeless luxury aesthetic",
    assets: {
      coin: "An ornate classical gold medallion coin with detailed baroque engravings around the rim. Deep rich 24-karat gold. Laurel wreath around a dollar sign. Elegant timeless. Dark transparent background. 1024x1024.",
      background: "A deep navy background (#0c1222) with subtle ornate gold filigree pattern at edges. Classical elegant. Very subtle damask or brocade texture. Rich and luxurious. 1024x1024.",
      particle: "A small gold fleur-de-lis or ornate star shape. Classical gold color. Elegant refined. Transparent background. 256x256.",
      icon: "A classical gold laurel wreath icon forming a circle. Elegant timeless design. Deep rich gold. Ornate details. Transparent background. 512x512.",
      splash: "A classical elegant splash background. Deep navy with ornate gold border frame. Baroque corner decorations. Rich luxurious feel. Space for text. 1024x1024.",
      tab_click: "A classical ornate gold coin icon, baroque engravings, rich deep gold, elegant, dark transparent background, 128x128.",
      tab_shop: "A classical gold treasure/jewel box icon, ornate design, rich gold details, elegant, dark transparent background, 128x128.",
      tab_board: "A classical gold laurel wreath trophy icon, ornate baroque style, rich gold, elegant, dark transparent background, 128x128.",
      tab_battle: "Classical gold crossed swords with ornate hilts, baroque style, rich gold details, dark transparent background, 128x128.",
      tab_skins: "A classical gold ornate mirror icon, baroque frame, rich gold, elegant craftsmanship, dark transparent background, 128x128.",
    },
  },
};

// ─── GENERATION ──────────────────────────────────────────────────────────────

async function generateImage(vibeId, assetName, prompt) {
  console.log(`  Generating ${assetName}...`);

  const body = {
    contents: [{
      parts: [{ text: prompt + "\n\nGenerate this image. Output only the image, no text." }],
    }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 0.4,
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) {
    console.error(`    Error: ${data.error.message}`);
    return null;
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      const dir = path.join(__dirname, "..", "vibe-assets", vibeId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, assetName + ".png");
      fs.writeFileSync(filePath, buffer);
      console.log(`    Saved: ${assetName}.png (${(buffer.length / 1024).toFixed(0)}KB)`);
      return filePath;
    }
  }

  console.error(`    No image returned for ${assetName}`);
  return null;
}

function uploadToR2(vibeId, assetName, localPath) {
  const r2Key = `vibes/${vibeId}/${assetName}.png`;
  try {
    execFileSync("npx", [
      "wrangler", "r2", "object", "put",
      `fund-clicker-assets/${r2Key}`,
      `--file=${localPath}`,
      "--content-type=image/png",
    ], { stdio: "pipe" });
    console.log(`    → R2: ${r2Key}`);
    return true;
  } catch {
    console.error(`    → R2 upload failed`);
    return false;
  }
}

async function generateVibeAssets(vibeId) {
  const vibe = VIBES[vibeId];
  if (!vibe) {
    console.error(`Unknown vibe: ${vibeId}`);
    return;
  }

  console.log(`\n═══ ${vibe.style.split(",")[0].toUpperCase()} (${vibeId}) ═══`);

  let generated = 0;
  const assetNames = Object.keys(vibe.assets);

  for (const assetName of assetNames) {
    // Skip coin if it already exists
    if (assetName === "coin") {
      const coinPath = path.join(__dirname, "..", "vibe-assets", vibeId, "coin.png");
      if (fs.existsSync(coinPath)) {
        console.log(`  Skipping coin (already exists)`);
        generated++;
        continue;
      }
    }

    const filePath = await generateImage(vibeId, assetName, vibe.assets[assetName]);
    if (filePath) {
      uploadToR2(vibeId, assetName, filePath);
      generated++;
    }

    // Rate limit: 1.5s between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`  ${generated}/${assetNames.length} assets generated for ${vibeId}\n`);
  return generated;
}

async function main() {
  const targetVibe = process.argv[2];

  console.log("Fund Clicker: Full Vibe Asset Generation");
  console.log(`Model: ${MODEL}`);
  console.log(`Assets per vibe: coin, background, particle, icon, splash, 5 tab icons (10 total)\n`);

  if (targetVibe) {
    await generateVibeAssets(targetVibe);
  } else {
    let totalGenerated = 0;
    const vibeIds = Object.keys(VIBES);
    for (const vibeId of vibeIds) {
      const count = await generateVibeAssets(vibeId);
      totalGenerated += (count || 0);
    }
    console.log(`\n═══ COMPLETE ═══`);
    console.log(`Total: ${totalGenerated}/${vibeIds.length * 10} assets generated across ${vibeIds.length} vibes.`);
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
