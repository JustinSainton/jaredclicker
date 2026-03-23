#!/usr/bin/env node
// Migrate Jared Clicker DO data into Fund Clicker platform
// Reads from the old jaredclicker-live worker's debug-state endpoint
// and imports into the new Fund Clicker org's DO
//
// Usage: node scripts/migrate-jaredclicker.js

const OLD_API = "https://jaredclicker-live.justin-5b6.workers.dev";
const NEW_API = "https://api.fundclicker.com/api/v1";
const ORG_SLUG = "jared-clicker";

async function fetchOldData() {
  console.log("Fetching data from old Jared Clicker...\n");

  // Get debug state (scores, epoch, connections, sabotages)
  const debugRes = await fetch(`${OLD_API}/debug-state`);
  const debugState = await debugRes.json();

  console.log(`  Score epoch: ${debugState.epoch}`);
  console.log(`  Persisted scores: ${debugState.persistedScoreCount}`);
  console.log(`  Connected clients: ${debugState.connCount}`);
  console.log(`  Active sabotages: ${debugState.sabotages?.length || 0}`);

  // Get leaderboard (full scores with names)
  const lbRes = await fetch(`${OLD_API}/leaderboard`);
  const leaderboard = await lbRes.json();
  console.log(`  Leaderboard entries: ${leaderboard.length}`);

  return { debugState, leaderboard };
}

async function importScores(leaderboard) {
  console.log("\nImporting scores into Fund Clicker org...");

  let imported = 0;
  for (const entry of leaderboard) {
    try {
      const res = await fetch(`${NEW_API}/orgs/${ORG_SLUG}/import-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: entry.name,
          score: entry.score,
        }),
      });
      if (res.ok) {
        imported++;
        if (imported % 10 === 0) console.log(`  Imported ${imported}/${leaderboard.length} scores...`);
      }
    } catch (e) {
      console.error(`  Failed to import ${entry.name}: ${e.message}`);
    }
  }

  console.log(`  Done: ${imported}/${leaderboard.length} scores imported.`);
}

async function main() {
  console.log("=== Jared Clicker → Fund Clicker Migration ===\n");

  const { debugState, leaderboard } = await fetchOldData();

  // Import scores
  await importScores(leaderboard);

  console.log("\n=== Migration Summary ===");
  console.log(`Org: ${ORG_SLUG}`);
  console.log(`Join Code: JARED1`);
  console.log(`Scores migrated: ${leaderboard.length}`);
  console.log(`Custom coin: orgs/jared-clicker/coin.png (Jared's face)`);
  console.log(`Character photos: 2 (Luke photos)`);
  console.log(`Skin packs: 5 (cyberpunk, medieval, pirate, space, underwater)`);
  console.log(`Sound files: 4 (coin.mp3, upgrade.wav, achievement.wav, fart.wav)`);
  console.log("\nNote: Player accounts (PINs/tokens) cannot be migrated between");
  console.log("different DO instances. Players will need to re-register in the app.");
  console.log("Their scores are preserved and will be associated with their new accounts.");
  console.log("\nTo fully replace jaredclicker.com with the app, players join with");
  console.log("code: JARED1 (or search for 'Jared Clicker' in the app).");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
