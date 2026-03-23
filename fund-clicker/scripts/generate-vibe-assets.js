#!/usr/bin/env node
// Generate vibe-specific coin images via Gemini API and upload to R2
// Usage: GEMINI_API_KEY=your_key node scripts/generate-vibe-assets.js
//
// Generates a coin.png for each of the 6 vibes and uploads to R2
// under /vibes/{vibeId}/coin.png
//
// Prerequisites:
// - GEMINI_API_KEY environment variable
// - wrangler authenticated (for R2 uploads via npx wrangler r2 object put)

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const VIBES = {
  "retro-arcade": {
    prompt: "A golden pixel art coin in 8-bit retro arcade style. The coin should have a dollar sign embossed in the center. Neon gold edges glowing against a fully transparent background. Pixel art style with visible pixels. Single coin centered. Square image 1024x1024 pixels. Dark transparent background.",
  },
  "modern-minimal": {
    prompt: "A sleek modern coin with an indigo to violet gradient surface. Minimalist design with clean smooth beveled edges. A subtle dollar sign etched into the center. Dark transparent background. No extra elements. Single coin centered. Square image 1024x1024 pixels.",
  },
  "nature-earth": {
    prompt: "A rustic wooden coin with leaf and vine engravings around the rim. Warm amber and brown tones. Organic wood grain texture visible on the surface. A small tree symbol in the center. Dark transparent background. Single coin centered. Square image 1024x1024 pixels.",
  },
  "neon-cyber": {
    prompt: "A holographic cyan neon circuit board coin. Glowing electric cyan edges with circuit trace patterns on the surface. The center has a glowing digital dollar sign. Cyberpunk aesthetic. Dark transparent background. Single coin centered. Square image 1024x1024 pixels.",
  },
  "pastel-pop": {
    prompt: "A soft pastel purple and pink gradient coin with a star shape cutout in the center. Bubbly playful style with light sparkle effects around the edges. Rounded soft edges. Light transparent background. Single coin centered. Square image 1024x1024 pixels.",
  },
  "classic-gold": {
    prompt: "An ornate classical gold medallion coin with detailed baroque engravings around the rim. Deep rich 24-karat gold color. A laurel wreath surrounds a dollar sign in the center. Elegant timeless design. Dark transparent background. Single coin centered. Square image 1024x1024 pixels.",
  },
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: Set GEMINI_API_KEY environment variable");
  console.error("Usage: GEMINI_API_KEY=your_key node scripts/generate-vibe-assets.js");
  process.exit(1);
}

// Use nano-banana-pro for image generation (or gemini-2.5-flash-image as fallback)
const MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async function generateCoin(vibeId, prompt) {
  console.log(`\nGenerating coin for ${vibeId}...`);

  const body = {
    contents: [{
      parts: [{
        text: prompt + "\n\nGenerate this image. Output only the image, no text.",
      }],
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
    console.error(`  Error: ${data.error.message}`);
    return null;
  }

  // Extract image data from response
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const base64 = part.inlineData.data;
      const buffer = Buffer.from(base64, "base64");

      // Save locally
      const dir = path.join(__dirname, "..", "vibe-assets", vibeId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "coin.png");
      fs.writeFileSync(filePath, buffer);
      console.log(`  Saved: ${filePath} (${buffer.length} bytes)`);

      return { vibeId, filePath, size: buffer.length };
    }
  }

  console.error(`  No image in response for ${vibeId}`);
  return null;
}

function uploadToR2(vibeId, localPath) {
  const r2Key = `vibes/${vibeId}/coin.png`;

  try {
    execFileSync("npx", [
      "wrangler", "r2", "object", "put",
      `fund-clicker-assets/${r2Key}`,
      `--file=${localPath}`,
      "--content-type=image/png",
    ], { stdio: "pipe" });
    console.log(`  Uploaded to R2: ${r2Key}`);
    return true;
  } catch (e) {
    console.error(`  R2 upload failed for ${vibeId}`);
    return false;
  }
}

async function main() {
  console.log("Fund Clicker: Generating vibe-specific coin assets via Gemini\n");

  const results = [];

  for (const [vibeId, config] of Object.entries(VIBES)) {
    const result = await generateCoin(vibeId, config.prompt);
    if (result) {
      results.push(result);
      uploadToR2(vibeId, result.filePath);
    }

    // Rate limit: wait 2s between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\nDone! Generated ${results.length}/${Object.keys(VIBES).length} coins.`);

  if (results.length < Object.keys(VIBES).length) {
    console.log("Some generations failed. Re-run to retry failed vibes.");
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
