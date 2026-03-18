#!/usr/bin/env python3
"""
Generate a Jared Clicker skin pack using Google Gemini image generation.

Usage:
    python3 generate_skin.py --theme "pirate" --api-key YOUR_KEY --output ./output
    python3 generate_skin.py --theme "space" --api-key YOUR_KEY --output ./output --reference jared-coin.png

Assets generated per skin pack:
    1. coin.png       - The main clickable coin (replaces jared-coin.png)
    2. background.png - Full page background gradient/pattern
    3. banner.png     - Header/title banner decoration
    4. icon.png       - Favicon/app icon version of the coin
    5. particle.png   - Click particle effect sprite
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error


MODEL = "gemini-3.1-flash-image-preview"
API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Skin pack asset definitions with prompt templates
# {ref_instruction} is filled in when a reference image is provided
ASSETS = [
    {
        "name": "coin",
        "filename": "coin.png",
        "use_reference": True,
        "prompt_template": (
            "{ref_instruction}"
            "Create a circular coin game asset for a clicker game. Theme: {theme}. "
            "The coin MUST feature the EXACT SAME man from the reference image — same face shape, "
            "same hairstyle, same facial features — but dressed/styled for the {theme} theme. "
            "Keep his likeness consistent and recognizable. "
            "Surround him with decorative border elements and small thematic icons matching the {theme} theme. "
            "The coin should have a metallic sheen and look like a real collectible token. "
            "Style: polished game asset, clean edges, circular shape, transparent background. "
            "The text around the rim should say 'JARED IS {theme_upper}'. "
            "High quality, detailed, game-ready asset."
        ),
    },
    {
        "name": "background",
        "filename": "background.png",
        "use_reference": False,
        "prompt_template": (
            "Create a seamless background pattern for a {theme}-themed clicker game UI. "
            "Dark, moody atmosphere suitable for a game interface. "
            "Include subtle {theme}-related motifs and patterns. "
            "Color palette should complement the {theme} theme with deep, rich tones. "
            "No text. No characters. Just an atmospheric background pattern. "
            "Style: dark game UI background, subtle patterns, not too busy or distracting."
        ),
    },
    {
        "name": "banner",
        "filename": "banner.png",
        "use_reference": True,
        "prompt_template": (
            "{ref_instruction}"
            "Create a decorative header banner for a {theme}-themed clicker game. "
            "Wide horizontal banner shape. The SAME man from the reference coin image should appear "
            "as a small motif or emblem within the banner design — keep his face recognizable. "
            "Include {theme}-themed ornamental elements on both sides. "
            "Leave space in the center for game title text overlay. "
            "Dark background with glowing {theme}-themed accent colors. "
            "Style: game UI banner, ornate but not cluttered, horizontal layout."
        ),
    },
    {
        "name": "icon",
        "filename": "icon.png",
        "use_reference": True,
        "prompt_template": (
            "{ref_instruction}"
            "Create a small square app icon for a {theme}-themed clicker game. "
            "Feature the EXACT SAME man from the reference image on a coin — keep his face, "
            "hairstyle, and expression recognizable but simplified for small sizes. "
            "Dress/style him for the {theme} theme. Bold, recognizable at small sizes. "
            "{theme} color palette. "
            "Style: mobile app icon, clean, bold, square with rounded corners."
        ),
    },
    {
        "name": "particle",
        "filename": "particle.png",
        "use_reference": False,
        "prompt_template": (
            "Create a small particle effect sprite for a {theme}-themed clicker game. "
            "This appears when the player clicks the coin. "
            "Small burst of {theme}-themed sparkles, stars, or thematic elements. "
            "Transparent background. Bright, eye-catching colors matching {theme} theme. "
            "Style: game particle effect, small sprite, transparent background, vibrant."
        ),
    },
]


def generate_image(api_key, prompt, size="1K", reference_b64=None):
    """Call Gemini API to generate a single image. Returns base64 PNG data."""
    url = API_URL.format(model=MODEL)
    url += "?key=" + api_key

    parts = []
    if reference_b64:
        parts.append({"inlineData": {"mimeType": "image/png", "data": reference_b64}})
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "imageSize": size,
            },
        },
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  API error ({e.code}): {body[:500]}", file=sys.stderr)
        return None

    # Extract image data from response
    candidates = result.get("candidates", [])
    if not candidates:
        print("  No candidates in response", file=sys.stderr)
        return None

    for part in candidates[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            return part["inlineData"]["data"]

    print("  No image data in response", file=sys.stderr)
    return None


def generate_skin_pack(theme, api_key, output_dir, size="1K", dry_run=False, reference_path=None):
    """Generate all assets for a skin pack."""
    os.makedirs(output_dir, exist_ok=True)

    theme_upper = theme.upper()
    total_cost = 0
    cost_per_image = 0.045 if size == "512" else 0.067 if size == "1K" else 0.134
    generated = []
    failed = []

    # Load reference image if provided
    reference_b64 = None
    if reference_path:
        with open(reference_path, "rb") as f:
            reference_b64 = base64.b64encode(f.read()).decode("utf-8")
        print(f"Using reference image: {reference_path}")

    ref_instruction = (
        "IMPORTANT: Use the attached reference image as the character reference. "
        "The man on this coin is 'Jared' — you MUST preserve his exact likeness, face shape, "
        "and features in the new image. Re-imagine him in the new theme but keep him recognizable. "
    ) if reference_b64 else ""

    print(f"Generating '{theme}' skin pack ({len(ASSETS)} assets at {size} resolution)")
    print(f"Estimated cost: ~${cost_per_image * len(ASSETS):.3f}")
    print(f"Output: {output_dir}")
    print()

    if dry_run:
        print("DRY RUN - showing prompts only:\n")
        for asset in ASSETS:
            prompt = asset["prompt_template"].format(
                theme=theme, theme_upper=theme_upper,
                ref_instruction=ref_instruction if asset.get("use_reference") else "",
            )
            ref_tag = " [+REF IMAGE]" if asset.get("use_reference") and reference_b64 else ""
            print(f"  {asset['name']}:{ref_tag}")
            print(f"    {prompt}\n")
        return {"generated": [], "failed": [], "total_cost": 0}

    for i, asset in enumerate(ASSETS):
        prompt = asset["prompt_template"].format(
            theme=theme, theme_upper=theme_upper,
            ref_instruction=ref_instruction if asset.get("use_reference") else "",
        )
        filepath = os.path.join(output_dir, asset["filename"])

        # Only send reference image for assets that need it
        send_ref = reference_b64 if asset.get("use_reference") else None

        print(f"  [{i+1}/{len(ASSETS)}] Generating {asset['name']}" +
              (" [+ref]" if send_ref else "") + "...", end=" ", flush=True)

        image_data = generate_image(api_key, prompt, size, send_ref)

        if image_data:
            img_bytes = base64.b64decode(image_data)
            with open(filepath, "wb") as f:
                f.write(img_bytes)
            file_size_kb = len(img_bytes) / 1024
            total_cost += cost_per_image
            generated.append(asset["name"])
            print(f"OK ({file_size_kb:.0f} KB)")
        else:
            failed.append(asset["name"])
            print("FAILED")

        # Small delay between requests to avoid rate limiting
        if i < len(ASSETS) - 1:
            time.sleep(1)

    print()
    print(f"Results: {len(generated)}/{len(ASSETS)} generated, {len(failed)} failed")
    print(f"Estimated API cost: ${total_cost:.3f}")

    # Write manifest
    manifest = {
        "theme": theme,
        "size": size,
        "assets": {a["name"]: a["filename"] for a in ASSETS if a["name"] in generated},
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "estimated_cost_cents": round(total_cost * 100),
        "reference_used": bool(reference_path),
    }
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest written to {manifest_path}")

    return {"generated": generated, "failed": failed, "total_cost": total_cost}


def main():
    parser = argparse.ArgumentParser(description="Generate a Jared Clicker skin pack using Gemini")
    parser.add_argument("--theme", required=True, help="Skin theme (e.g. pirate, cyberpunk, space)")
    parser.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY"), help="Gemini API key (or set GEMINI_API_KEY env var)")
    parser.add_argument("--output", default="./skin-output", help="Output directory")
    parser.add_argument("--size", default="1K", choices=["512", "1K", "2K"], help="Image resolution (default: 1K)")
    parser.add_argument("--dry-run", action="store_true", help="Show prompts without generating")
    parser.add_argument("--asset", help="Generate only a specific asset (coin, background, banner, icon, particle)")
    parser.add_argument("--reference", help="Path to reference image (e.g. jared-coin.png) for character consistency")
    args = parser.parse_args()

    if not args.api_key and not args.dry_run:
        print("Error: --api-key or GEMINI_API_KEY environment variable required", file=sys.stderr)
        sys.exit(1)

    global ASSETS
    if args.asset:
        ASSETS = [a for a in ASSETS if a["name"] == args.asset]
        if not ASSETS:
            print(f"Error: unknown asset '{args.asset}'", file=sys.stderr)
            sys.exit(1)

    result = generate_skin_pack(args.theme, args.api_key, args.output, args.size, args.dry_run, args.reference)

    if result["failed"] and not args.dry_run:
        sys.exit(1)


if __name__ == "__main__":
    main()
